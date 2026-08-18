import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectAsync,
  invoke,
  loadStepAdapter,
  projectPath,
  readProjectText,
  requireFunction,
  withTemporaryDirectory,
  writeTextFile,
} from "../_support/step-test-kit.js";

type AsyncResult<T> = T | Promise<T>;

export function registerStep00Contract(): void {
  describe("step 00 - scope and invariants", () => {
    it("records the scope in an architecture decision", async () => {
      const adrPath = "docs/adr/0001-agent-scope.md";
      expect(existsSync(projectPath(adrPath)), `Create ${adrPath}.`).toBe(true);
      const content = await readProjectText(adrPath);

      for (const term of ["AgentLoop", "Provider", "Tool", "Policy", "Sandbox", "maxSteps"]) {
        expect(content, `ADR must explain ${term}.`).toContain(term);
      }
    });

    it("states non-goals and side-effect boundaries", async () => {
      const content = await readProjectText("docs/adr/0001-agent-scope.md");
      expect(content).toMatch(/非目标|不实现|out of scope/i);
      expect(content).toMatch(/副作用|side effect/i);
      expect(content).toMatch(/单 Agent|single agent/i);
      expect(content).toMatch(/单 Provider|single provider/i);
    });
  });
}

export function registerStep01Contract(): void {
  describe("step 01 - project quality baseline", () => {
    it("defines all required project commands", async () => {
      const packageJson = JSON.parse(await readProjectText("package.json")) as {
        scripts?: Record<string, string>;
      };

      for (const script of ["start", "build", "typecheck", "test", "lint", "format"]) {
        expect(packageJson.scripts?.[script], `Missing npm script: ${script}.`).toBeTypeOf(
          "string",
        );
      }
    });

    it("enables strict TypeScript checks", async () => {
      const tsconfig = JSON.parse(await readProjectText("tsconfig.json")) as {
        compilerOptions?: Record<string, unknown>;
      };
      const options = tsconfig.compilerOptions ?? {};

      expect(options.strict).toBe(true);
      expect(options.noUncheckedIndexedAccess).toBe(true);
      expect(options.exactOptionalPropertyTypes).toBe(true);
      expect(options.useUnknownInCatchVariables).toBe(true);
    });

    it("keeps generated and dependency directories out of Git", async () => {
      const gitignore = await readProjectText(".gitignore");
      expect(gitignore).toContain("node_modules/");
      expect(gitignore).toContain("dist/");
      expect(gitignore).toContain("coverage/");
    });

    it("links the learning plan from the project README", async () => {
      const readme = await readProjectText("README.md");
      expect(readme).toContain("docs/AGENT_LEARNING_PLAN.md");
    });
  });
}

interface MessageExamples {
  user: unknown;
  assistantWithToolCall: unknown;
  toolResult: unknown;
}

export function registerStep02Contract(): void {
  describe("step 02 - internal message protocol", () => {
    it("round-trips every canonical example without losing data", async () => {
      const adapter = await loadStepAdapter("02");
      const createExamples = requireFunction<() => AsyncResult<MessageExamples>>(
        adapter,
        "createMessageExamples",
      );
      const roundTrip = requireFunction<(message: unknown) => AsyncResult<unknown>>(
        adapter,
        "roundTripMessage",
      );
      const examples = await createExamples();

      for (const message of Object.values(examples)) {
        expect(await roundTrip(message)).toEqual(message);
      }
    });

    it("keeps tool call and tool result identifiers linked", async () => {
      const adapter = await loadStepAdapter("02");
      const createExamples = requireFunction<() => AsyncResult<MessageExamples>>(
        adapter,
        "createMessageExamples",
      );
      const extractToolLink = requireFunction<
        (
          assistant: unknown,
          toolResult: unknown,
        ) => AsyncResult<{ callId: string; resultCallId: string }>
      >(adapter, "extractToolLink");
      const examples = await createExamples();
      const link = await extractToolLink(examples.assistantWithToolCall, examples.toolResult);

      expect(link.callId).not.toBe("");
      expect(link.resultCallId).toBe(link.callId);
    });

    it("rejects structurally invalid messages at the public boundary", async () => {
      const adapter = await loadStepAdapter("02");
      const parseMessage = requireFunction<(value: unknown) => AsyncResult<unknown>>(
        adapter,
        "parseMessage",
      );

      await expect(
        invoke(() => parseMessage({ role: "tool", content: "missing tool call id" })),
      ).rejects.toThrow();
      await expect(invoke(() => parseMessage({ role: "unknown", content: [] }))).rejects.toThrow();
    });
  });
}

interface EventStreamHarness {
  events: AsyncIterable<unknown>;
  push(event: unknown): AsyncResult<void>;
  end(result: unknown): AsyncResult<void>;
  fail(error: Error): AsyncResult<void>;
  result(): Promise<unknown>;
}

export function registerStep03Contract(): void {
  describe("step 03 - asynchronous event stream", () => {
    it("preserves event order and exposes one final result", async () => {
      const adapter = await loadStepAdapter("03");
      const createEventStream = requireFunction<() => AsyncResult<EventStreamHarness>>(
        adapter,
        "createEventStream",
      );
      const harness = await createEventStream();
      const collecting = collectAsync(harness.events);

      await harness.push({ sequence: 1 });
      await harness.push({ sequence: 2 });
      await harness.end({ status: "completed" });

      expect(await collecting).toEqual([{ sequence: 1 }, { sequence: 2 }]);
      expect(await harness.result()).toEqual({ status: "completed" });
    });

    it("rejects writes and repeated completion after termination", async () => {
      const adapter = await loadStepAdapter("03");
      const createEventStream = requireFunction<() => AsyncResult<EventStreamHarness>>(
        adapter,
        "createEventStream",
      );
      const harness = await createEventStream();
      await harness.end("done");

      await expect(invoke(() => harness.push("late"))).rejects.toThrow();
      await expect(invoke(() => harness.end("again"))).rejects.toThrow();
    });

    it("propagates producer failure to the final result", async () => {
      const adapter = await loadStepAdapter("03");
      const createEventStream = requireFunction<() => AsyncResult<EventStreamHarness>>(
        adapter,
        "createEventStream",
      );
      const harness = await createEventStream();
      const failure = new Error("provider disconnected");

      await harness.fail(failure);
      await expect(harness.result()).rejects.toThrow("provider disconnected");
    });
  });
}

interface ScriptedModelRun {
  events: unknown[];
  requests: unknown[];
}

export function registerStep04Contract(): void {
  describe("step 04 - scripted model", () => {
    it("emits the scripted event sequence deterministically", async () => {
      const adapter = await loadStepAdapter("04");
      const runScriptedModel = requireFunction<
        (events: unknown[], request: unknown) => AsyncResult<ScriptedModelRun>
      >(adapter, "runScriptedModel");
      const events = [
        { type: "text_delta", text: "hello" },
        { type: "finish", reason: "stop" },
      ];
      const request = { messages: [{ role: "user", content: "hi" }] };
      const result = await runScriptedModel(events, request);

      expect(result.events).toEqual(events);
      expect(result.requests).toEqual([request]);
    });

    it("preserves fragmented tool-call arguments", async () => {
      const adapter = await loadStepAdapter("04");
      const runFragmentedToolCall = requireFunction<
        () => AsyncResult<{ arguments: unknown; fragments: string[] }>
      >(adapter, "runFragmentedToolCall");
      const result = await runFragmentedToolCall();

      expect(result.fragments.length).toBeGreaterThan(1);
      expect(result.arguments).toEqual({ a: 1, b: 2 });
    });

    it("stops a hanging stream when aborted", async () => {
      const adapter = await loadStepAdapter("04");
      const runAbortScenario = requireFunction<
        () => AsyncResult<{ status: string; eventsAfterAbort: number }>
      >(adapter, "runAbortScenario");
      const result = await runAbortScenario();

      expect(result.status).toBe("aborted");
      expect(result.eventsAfterAbort).toBe(0);
    });
  });
}

interface ProviderScenarioResult {
  status: string;
  eventTypes?: string[];
  toolArguments?: unknown;
  errorKind?: string;
  retryable?: boolean;
  credentialsExposed?: boolean;
}

export function registerStep05Contract(): void {
  describe("step 05 - real provider adapter", () => {
    it("normalizes text and fragmented tool-call streams", async () => {
      const adapter = await loadStepAdapter("05");
      const runProviderScenario = requireFunction<
        (scenario: string) => AsyncResult<ProviderScenarioResult>
      >(adapter, "runProviderScenario");

      const text = await runProviderScenario("text");
      const toolCall = await runProviderScenario("fragmented-tool-call");

      expect(text.status).toBe("completed");
      expect(text.eventTypes).toContain("text_delta");
      expect(toolCall.toolArguments).toEqual({ path: "README.md" });
    });

    it("classifies authentication and rate-limit failures", async () => {
      const adapter = await loadStepAdapter("05");
      const runProviderScenario = requireFunction<
        (scenario: string) => AsyncResult<ProviderScenarioResult>
      >(adapter, "runProviderScenario");

      const unauthorized = await runProviderScenario("unauthorized");
      const rateLimited = await runProviderScenario("rate-limit");

      expect(unauthorized.errorKind).toBe("authentication");
      expect(unauthorized.retryable).toBe(false);
      expect(rateLimited.errorKind).toBe("rate_limit");
      expect(rateLimited.retryable).toBe(true);
    });

    it("never exposes credentials through normalized errors", async () => {
      const adapter = await loadStepAdapter("05");
      const runProviderScenario = requireFunction<
        (scenario: string) => AsyncResult<ProviderScenarioResult>
      >(adapter, "runProviderScenario");
      const result = await runProviderScenario("unauthorized");

      expect(result.credentialsExposed).toBe(false);
    });
  });
}

interface SingleTurnResult {
  status: string;
  messages: unknown[];
  eventTypes: string[];
}

export function registerStep06Contract(): void {
  describe("step 06 - single-turn agent", () => {
    it("records one user message and one completed assistant message", async () => {
      const adapter = await loadStepAdapter("06");
      const runSingleTurnScenario = requireFunction<
        (scenario: string) => AsyncResult<SingleTurnResult>
      >(adapter, "runSingleTurnScenario");
      const result = await runSingleTurnScenario("text");

      expect(result.status).toBe("completed");
      expect(result.messages).toHaveLength(2);
      expect(result.eventTypes).toEqual([
        "turn.started",
        "model.started",
        "model.completed",
        "turn.completed",
      ]);
    });

    it.each([
      ["length", "length"],
      ["provider-error", "failed"],
      ["abort", "aborted"],
    ])("closes the %s scenario with status %s", async (scenario, status) => {
      const adapter = await loadStepAdapter("06");
      const runSingleTurnScenario = requireFunction<
        (scenario: string) => AsyncResult<SingleTurnResult>
      >(adapter, "runSingleTurnScenario");
      const result = await runSingleTurnScenario(scenario);

      expect(result.status).toBe(status);
      expect(result.eventTypes.at(-1)).toMatch(/turn\.(completed|failed|cancelled)/);
    });
  });
}

interface ToolRegistryScenario {
  status: string;
  executed: boolean;
  isError?: boolean;
  toolCallId?: string;
}

export function registerStep07Contract(): void {
  describe("step 07 - tool protocol and registry", () => {
    it("validates arguments before executing a registered tool", async () => {
      const adapter = await loadStepAdapter("07");
      const runToolRegistryScenario = requireFunction<
        (scenario: string) => AsyncResult<ToolRegistryScenario>
      >(adapter, "runToolRegistryScenario");

      expect(await runToolRegistryScenario("success")).toMatchObject({
        status: "completed",
        executed: true,
      });
      expect(await runToolRegistryScenario("invalid-arguments")).toMatchObject({
        status: "validation_error",
        executed: false,
        isError: true,
      });
    });

    it("normalizes unknown tools and tool exceptions", async () => {
      const adapter = await loadStepAdapter("07");
      const runToolRegistryScenario = requireFunction<
        (scenario: string) => AsyncResult<ToolRegistryScenario>
      >(adapter, "runToolRegistryScenario");

      expect(await runToolRegistryScenario("unknown-tool")).toMatchObject({
        executed: false,
        isError: true,
      });
      expect(await runToolRegistryScenario("tool-error")).toMatchObject({
        executed: true,
        isError: true,
      });
    });

    it("rejects duplicate tool names", async () => {
      const adapter = await loadStepAdapter("07");
      const runToolRegistryScenario = requireFunction<
        (scenario: string) => AsyncResult<ToolRegistryScenario>
      >(adapter, "runToolRegistryScenario");

      await expect(
        invoke(() => runToolRegistryScenario("duplicate-registration")),
      ).rejects.toThrow();
    });
  });
}

interface AgentLoopScenario {
  status: string;
  steps: number;
  toolCalls: Array<{ id: string; resultCount: number; isError?: boolean }>;
  finalText?: string;
}

export function registerStep08Contract(): void {
  describe("step 08 - sequential tool loop", () => {
    it("feeds one tool result back to the model before the final answer", async () => {
      const adapter = await loadStepAdapter("08");
      const runAgentLoopScenario = requireFunction<
        (scenario: string) => AsyncResult<AgentLoopScenario>
      >(adapter, "runAgentLoopScenario");
      const result = await runAgentLoopScenario("single-tool");

      expect(result.status).toBe("completed");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]?.resultCount).toBe(1);
      expect(result.finalText).not.toBe("");
    });

    it("handles multiple tools in model order", async () => {
      const adapter = await loadStepAdapter("08");
      const runAgentLoopScenario = requireFunction<
        (scenario: string) => AsyncResult<AgentLoopScenario>
      >(adapter, "runAgentLoopScenario");
      const result = await runAgentLoopScenario("multiple-tools");

      expect(result.toolCalls.length).toBeGreaterThan(1);
      expect(result.toolCalls.every((call) => call.resultCount === 1)).toBe(true);
    });

    it("returns tool errors to the model and enforces max steps", async () => {
      const adapter = await loadStepAdapter("08");
      const runAgentLoopScenario = requireFunction<
        (scenario: string) => AsyncResult<AgentLoopScenario>
      >(adapter, "runAgentLoopScenario");
      const invalid = await runAgentLoopScenario("invalid-tool-arguments");
      const exhausted = await runAgentLoopScenario("max-steps");

      expect(invalid.toolCalls.some((call) => call.isError)).toBe(true);
      expect(exhausted.status).toBe("budget_exhausted");
      expect(exhausted.steps).toBeGreaterThan(0);
    });
  });
}

interface AgentSessionScenario {
  status: string;
  eventTypes: string[];
  activeOperations: number;
}

export function registerStep09Contract(): void {
  describe("step 09 - stateful agent session", () => {
    it("rejects concurrent prompts in one session", async () => {
      const adapter = await loadStepAdapter("09");
      const runAgentSessionScenario = requireFunction<
        (scenario: string) => AsyncResult<AgentSessionScenario>
      >(adapter, "runAgentSessionScenario");
      const result = await runAgentSessionScenario("concurrent-prompt");

      expect(result.status).toBe("rejected_reentry");
      expect(result.activeOperations).toBe(1);
    });

    it("propagates interruption and returns to idle", async () => {
      const adapter = await loadStepAdapter("09");
      const runAgentSessionScenario = requireFunction<
        (scenario: string) => AsyncResult<AgentSessionScenario>
      >(adapter, "runAgentSessionScenario");
      const result = await runAgentSessionScenario("interrupt");

      expect(result.status).toBe("idle");
      expect(result.activeOperations).toBe(0);
      expect(result.eventTypes).toContain("session.cancelled");
      expect(result.eventTypes.at(-1)).toBe("session.idle");
    });

    it("isolates subscriber failures from the session", async () => {
      const adapter = await loadStepAdapter("09");
      const runAgentSessionScenario = requireFunction<
        (scenario: string) => AsyncResult<AgentSessionScenario>
      >(adapter, "runAgentSessionScenario");
      const result = await runAgentSessionScenario("subscriber-error");

      expect(result.status).toBe("completed");
      expect(result.eventTypes).toContain("turn.completed");
    });
  });
}

interface WorkspaceHarness {
  resolveForRead(path: string): AsyncResult<string>;
  resolveForWrite(path: string): AsyncResult<string>;
}

export function registerStep10Contract(): void {
  describe("step 10 - workspace path boundary", () => {
    it("accepts paths inside the workspace and rejects traversal", async () => {
      await withTemporaryDirectory("agent-workspace", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("10");
        const createWorkspace = requireFunction<(root: string) => AsyncResult<WorkspaceHarness>>(
          adapter,
          "createWorkspace",
        );
        const workspace = await createWorkspace(workspaceRoot);

        expect(await workspace.resolveForRead("src/index.ts")).toBe(
          resolve(workspaceRoot, "src/index.ts"),
        );
        await expect(invoke(() => workspace.resolveForRead("../secret.txt"))).rejects.toThrow();
      });
    });

    it("rejects absolute paths outside the workspace for reads and writes", async () => {
      await withTemporaryDirectory("agent-workspace", async (workspaceRoot) => {
        await withTemporaryDirectory("agent-outside", async (outsideRoot) => {
          const adapter = await loadStepAdapter("10");
          const createWorkspace = requireFunction<(root: string) => AsyncResult<WorkspaceHarness>>(
            adapter,
            "createWorkspace",
          );
          const workspace = await createWorkspace(workspaceRoot);
          const outsideFile = join(outsideRoot, "secret.txt");

          await expect(invoke(() => workspace.resolveForRead(outsideFile))).rejects.toThrow();
          await expect(invoke(() => workspace.resolveForWrite(outsideFile))).rejects.toThrow();
        });
      });
    });

    it("does not confuse a path-prefix sibling with the workspace", async () => {
      await withTemporaryDirectory("agent-workspace", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("10");
        const createWorkspace = requireFunction<(root: string) => AsyncResult<WorkspaceHarness>>(
          adapter,
          "createWorkspace",
        );
        const workspace = await createWorkspace(workspaceRoot);
        const prefixSibling = `${workspaceRoot}-other`;

        await expect(
          invoke(() => workspace.resolveForWrite(join(prefixSibling, "escape.txt"))),
        ).rejects.toThrow();
      });
    });
  });
}

interface ReadFileResult {
  content?: string;
  truncated?: boolean;
  binary?: boolean;
}

interface ReadonlyToolsHarness {
  list(path: string): AsyncResult<{ entries: string[] }>;
  read(path: string, options?: { maxBytes?: number }): AsyncResult<ReadFileResult>;
  search(query: string): AsyncResult<Array<{ path: string; line: number; text: string }>>;
  stat(path: string): AsyncResult<{ kind: string; size: number }>;
}

export function registerStep11Contract(): void {
  describe("step 11 - read-only file tools", () => {
    it("lists, reads, searches, and stats workspace files", async () => {
      await withTemporaryDirectory("agent-read-tools", async (workspaceRoot) => {
        await mkdir(join(workspaceRoot, "src"), { recursive: true });
        await writeTextFile(join(workspaceRoot, "src", "alpha.ts"), "first\nneedle\nthird\n");
        const adapter = await loadStepAdapter("11");
        const createReadonlyTools = requireFunction<
          (root: string) => AsyncResult<ReadonlyToolsHarness>
        >(adapter, "createReadonlyTools");
        const tools = await createReadonlyTools(workspaceRoot);

        expect((await tools.list("src")).entries).toContain("alpha.ts");
        expect((await tools.read("src/alpha.ts")).content).toContain("needle");
        expect(await tools.stat("src/alpha.ts")).toMatchObject({ kind: "file" });
        expect(await tools.search("needle")).toContainEqual({
          path: "src/alpha.ts",
          line: 2,
          text: "needle",
        });
      });
    });

    it("reports truncation and binary files without dumping unbounded content", async () => {
      await withTemporaryDirectory("agent-read-tools", async (workspaceRoot) => {
        await writeTextFile(join(workspaceRoot, "large.txt"), "x".repeat(4_096));
        await writeFile(join(workspaceRoot, "binary.bin"), Buffer.from([0, 1, 2, 3]));
        const adapter = await loadStepAdapter("11");
        const createReadonlyTools = requireFunction<
          (root: string) => AsyncResult<ReadonlyToolsHarness>
        >(adapter, "createReadonlyTools");
        const tools = await createReadonlyTools(workspaceRoot);

        const large = await tools.read("large.txt", { maxBytes: 128 });
        const binary = await tools.read("binary.bin");

        expect(large.truncated).toBe(true);
        expect((large.content ?? "").length).toBeLessThanOrEqual(128);
        expect(binary.binary).toBe(true);
      });
    });

    it("rejects all read-only operations outside the workspace", async () => {
      await withTemporaryDirectory("agent-read-tools", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("11");
        const createReadonlyTools = requireFunction<
          (root: string) => AsyncResult<ReadonlyToolsHarness>
        >(adapter, "createReadonlyTools");
        const tools = await createReadonlyTools(workspaceRoot);

        await expect(invoke(() => tools.read("../secret.txt"))).rejects.toThrow();
      });
    });
  });
}
