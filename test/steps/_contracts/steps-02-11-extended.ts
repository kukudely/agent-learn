import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectAsync,
  invoke,
  loadStepAdapter,
  requireFunction,
  withTemporaryDirectory,
  writeTextFile,
} from "../_support/step-test-kit.js";

type AsyncResult<T> = T | Promise<T>;

interface MessageExamples {
  user: unknown;
  assistantWithToolCall: unknown;
  toolResult: unknown;
}

export function registerStep02ExtendedContract(): void {
  describe("step 02 - extended protocol validation", () => {
    it("does not mutate canonical messages during round-trip", async () => {
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
      const before = JSON.stringify(examples);

      for (const message of Object.values(examples)) {
        await roundTrip(message);
      }

      expect(JSON.stringify(examples)).toBe(before);
    });

    it.each([
      "{",
      { version: 999, message: { role: "user", content: [] } },
      {
        role: "assistant",
        content: [{ type: "tool_result", toolCallId: "orphan" }],
      },
      { role: "tool", content: [{ type: "text", text: "not a result" }] },
      { role: "user", content: [{ type: "unknown" }] },
    ])("rejects malformed or role-incompatible protocol input", async (value) => {
      const adapter = await loadStepAdapter("02");
      const parseMessage = requireFunction<(input: unknown) => AsyncResult<unknown>>(
        adapter,
        "parseMessage",
      );

      await expect(invoke(() => parseMessage(value))).rejects.toThrow();
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

export function registerStep03ExtendedContract(): void {
  describe("step 03 - extended terminal-state behavior", () => {
    it("propagates the same producer failure to the iterator and final result", async () => {
      const adapter = await loadStepAdapter("03");
      const createEventStream = requireFunction<() => AsyncResult<EventStreamHarness>>(
        adapter,
        "createEventStream",
      );
      const harness = await createEventStream();
      const collecting = collectAsync(harness.events);

      await harness.push("before-error");
      await harness.fail(new Error("stream failed"));

      await expect(collecting).rejects.toThrow("stream failed");
      await expect(harness.result()).rejects.toThrow("stream failed");
    });

    it("keeps the first terminal transition when completion races with failure", async () => {
      const adapter = await loadStepAdapter("03");
      const createEventStream = requireFunction<() => AsyncResult<EventStreamHarness>>(
        adapter,
        "createEventStream",
      );
      const harness = await createEventStream();
      const collecting = collectAsync(harness.events);

      await harness.end("completed-first");
      await expect(invoke(() => harness.fail(new Error("late failure")))).rejects.toThrow();
      expect(await collecting).toEqual([]);
      expect(await harness.result()).toBe("completed-first");
    });
  });
}

interface ScriptedModelRun {
  events: unknown[];
  requests: unknown[];
}

export function registerStep04ExtendedContract(): void {
  describe("step 04 - extended scripted stream protocol", () => {
    it.each([
      [
        "duplicate finish",
        [
          { type: "finish", reason: "stop" },
          { type: "finish", reason: "stop" },
        ],
      ],
      ["missing finish", [{ type: "text_delta", text: "partial" }]],
      [
        "event after finish",
        [
          { type: "finish", reason: "stop" },
          { type: "text_delta", text: "late" },
        ],
      ],
      [
        "invalid tool json",
        [
          {
            type: "tool_call_delta",
            id: "call-1",
            name: "read_file",
            argumentsDelta: "{bad",
          },
          { type: "finish", reason: "tool_calls" },
        ],
      ],
    ])("rejects %s", async (_name, events) => {
      const adapter = await loadStepAdapter("04");
      const runScriptedModel = requireFunction<
        (scriptedEvents: unknown[], request: unknown) => AsyncResult<ScriptedModelRun>
      >(adapter, "runScriptedModel");

      await expect(invoke(() => runScriptedModel(events, { messages: [] }))).rejects.toThrow();
    });
  });
}

interface ExtendedProviderResult {
  status: string;
  errorKind?: string;
  retryable?: boolean;
  activeRequestsAfter?: number;
  credentialsExposed?: boolean;
}

export function registerStep05ExtendedContract(): void {
  describe("step 05 - extended provider failures", () => {
    it.each([
      ["server-error", "server", true],
      ["malformed-stream", "protocol", false],
      ["no-body", "protocol", false],
      ["connection-interrupted", "connection", true],
      ["timeout", "timeout", true],
      ["abort", "aborted", false],
    ] as const)("normalizes %s as %s", async (scenario, errorKind, retryable) => {
      const adapter = await loadStepAdapter("05");
      const runProviderScenario = requireFunction<
        (name: string) => AsyncResult<ExtendedProviderResult>
      >(adapter, "runProviderScenario");
      const result = await runProviderScenario(scenario);

      expect(result.status).not.toBe("completed");
      expect(result.errorKind).toBe(errorKind);
      expect(result.retryable).toBe(retryable);
      expect(result.activeRequestsAfter).toBe(0);
      expect(result.credentialsExposed).toBe(false);
    });
  });
}

interface ExtendedSingleTurnResult {
  status: string;
  eventTypes: string[];
  terminalEvents?: number;
  resultStatus?: string;
  inputUnchanged?: boolean;
  outputBytes?: number;
  outputBudgetBytes?: number;
}

export function registerStep06ExtendedContract(): void {
  describe("step 06 - extended run invariants", () => {
    it.each(["text", "provider-error", "abort"])(
      "keeps event and result terminal states aligned for %s",
      async (scenario) => {
        const adapter = await loadStepAdapter("06");
        const runSingleTurnScenario = requireFunction<
          (name: string) => AsyncResult<ExtendedSingleTurnResult>
        >(adapter, "runSingleTurnScenario");
        const result = await runSingleTurnScenario(`${scenario}-invariants`);

        expect(result.terminalEvents).toBe(1);
        expect(result.resultStatus).toBe(result.status);
        expect(result.inputUnchanged).toBe(true);
      },
    );

    it("fails before committing a response that exceeds the output budget", async () => {
      const adapter = await loadStepAdapter("06");
      const runSingleTurnScenario = requireFunction<
        (name: string) => AsyncResult<ExtendedSingleTurnResult>
      >(adapter, "runSingleTurnScenario");
      const result = await runSingleTurnScenario("output-budget");

      expect(result.status).toBe("budget_exhausted");
      expect(result.outputBytes).toBeGreaterThan(
        result.outputBudgetBytes ?? Number.MAX_SAFE_INTEGER,
      );
      expect(result.eventTypes).not.toContain("turn.completed");
      expect(result.terminalEvents).toBe(1);
    });
  });
}

interface ExtendedRegistryResult {
  status: string;
  executed: boolean;
  isError?: boolean;
  registryChanged?: boolean;
  activeAfter?: number;
}

export function registerStep07ExtendedContract(): void {
  describe("step 07 - extended registry boundaries", () => {
    it.each(["extra-properties", "unserializable-output"])(
      "rejects or normalizes %s",
      async (scenario) => {
        const adapter = await loadStepAdapter("07");
        const runToolRegistryScenario = requireFunction<
          (name: string) => AsyncResult<ExtendedRegistryResult>
        >(adapter, "runToolRegistryScenario");
        const result = await runToolRegistryScenario(scenario);

        expect(result.isError).toBe(true);
      },
    );

    it("propagates cancellation instead of wrapping it as a normal tool error", async () => {
      const adapter = await loadStepAdapter("07");
      const runToolRegistryScenario = requireFunction<
        (name: string) => AsyncResult<ExtendedRegistryResult>
      >(adapter, "runToolRegistryScenario");
      const result = await runToolRegistryScenario("cancel");

      expect(result.status).toBe("aborted");
      expect(result.isError).not.toBe(true);
      expect(result.activeAfter).toBe(0);
    });

    it("returns an isolated list snapshot", async () => {
      const adapter = await loadStepAdapter("07");
      const runToolRegistryScenario = requireFunction<
        (name: string) => AsyncResult<ExtendedRegistryResult>
      >(adapter, "runToolRegistryScenario");
      const result = await runToolRegistryScenario("list-isolation");

      expect(result.status).toBe("completed");
      expect(result.registryChanged).toBe(false);
    });
  });
}

interface ExtendedLoopResult {
  status: string;
  executionOrder?: string[];
  resultOrder?: string[];
  maxActiveTools?: number;
  activeAfter?: number;
  sideEffectCount?: number;
}

export function registerStep08ExtendedContract(): void {
  describe("step 08 - extended loop side-effect safety", () => {
    it("executes and records tools strictly in model order", async () => {
      const adapter = await loadStepAdapter("08");
      const runAgentLoopScenario = requireFunction<
        (name: string) => AsyncResult<ExtendedLoopResult>
      >(adapter, "runAgentLoopScenario");
      const result = await runAgentLoopScenario("strict-order");

      expect(result.executionOrder).toEqual(["first", "second", "third"]);
      expect(result.resultOrder).toEqual(result.executionOrder);
      expect(result.maxActiveTools).toBe(1);
    });

    it("cancels an active tool and settles the loop", async () => {
      const adapter = await loadStepAdapter("08");
      const runAgentLoopScenario = requireFunction<
        (name: string) => AsyncResult<ExtendedLoopResult>
      >(adapter, "runAgentLoopScenario");
      const result = await runAgentLoopScenario("cancel-during-tool");

      expect(result.status).toBe("cancelled");
      expect(result.activeAfter).toBe(0);
    });

    it("does not repeat a completed side effect after the following model request fails", async () => {
      const adapter = await loadStepAdapter("08");
      const runAgentLoopScenario = requireFunction<
        (name: string) => AsyncResult<ExtendedLoopResult>
      >(adapter, "runAgentLoopScenario");
      const result = await runAgentLoopScenario("model-fails-after-tool");

      expect(result.status).toBe("failed");
      expect(result.sideEffectCount).toBe(1);
    });
  });
}

interface ExtendedSessionResult {
  status: string;
  historyLengths?: number[];
  snapshotChangedByCaller?: boolean;
  historiesIsolated?: boolean;
  activeOperations: number;
}

export function registerStep09ExtendedContract(): void {
  describe("step 09 - extended session state", () => {
    it("includes the first completed turn in the second model request", async () => {
      const adapter = await loadStepAdapter("09");
      const runAgentSessionScenario = requireFunction<
        (name: string) => AsyncResult<ExtendedSessionResult>
      >(adapter, "runAgentSessionScenario");
      const result = await runAgentSessionScenario("two-turn-history");

      expect(result.status).toBe("completed");
      expect(result.historyLengths).toEqual([1, 3]);
    });

    it("does not expose mutable snapshot state", async () => {
      const adapter = await loadStepAdapter("09");
      const runAgentSessionScenario = requireFunction<
        (name: string) => AsyncResult<ExtendedSessionResult>
      >(adapter, "runAgentSessionScenario");
      const result = await runAgentSessionScenario("snapshot-isolation");

      expect(result.snapshotChangedByCaller).toBe(false);
    });

    it("isolates two sessions and rejects sends after close", async () => {
      const adapter = await loadStepAdapter("09");
      const runAgentSessionScenario = requireFunction<
        (name: string) => AsyncResult<ExtendedSessionResult>
      >(adapter, "runAgentSessionScenario");
      const isolated = await runAgentSessionScenario("two-session-isolation");

      expect(isolated.historiesIsolated).toBe(true);
      await expect(invoke(() => runAgentSessionScenario("send-after-close"))).rejects.toThrow();
    });
  });
}

interface WorkspaceHarness {
  resolveForRead(path: string): AsyncResult<string>;
  resolveForWrite(path: string): AsyncResult<string>;
}

export function registerStep10ExtendedContract(): void {
  describe("step 10 - extended cross-platform path rejection", () => {
    it.each([
      "/etc/passwd",
      "C:\\Windows\\System32\\config",
      "\\\\server\\share\\secret",
      "folder\u0000name",
    ])("rejects unsafe path syntax %s", async (unsafePath) => {
      await withTemporaryDirectory("agent-workspace-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("10");
        const createWorkspace = requireFunction<(root: string) => AsyncResult<WorkspaceHarness>>(
          adapter,
          "createWorkspace",
        );
        const workspace = await createWorkspace(workspaceRoot);

        await expect(invoke(() => workspace.resolveForRead(unsafePath))).rejects.toThrow();
        await expect(invoke(() => workspace.resolveForWrite(unsafePath))).rejects.toThrow();
      });
    });

    it("resolves a nonexistent creation target only through an in-root parent", async () => {
      await withTemporaryDirectory("agent-workspace-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("10");
        const createWorkspace = requireFunction<(root: string) => AsyncResult<WorkspaceHarness>>(
          adapter,
          "createWorkspace",
        );
        const workspace = await createWorkspace(workspaceRoot);
        const target = join(workspaceRoot, "new", "file.txt");

        expect(await workspace.resolveForWrite("new/file.txt")).toBe(target);
      });
    });
  });
}

interface ReadonlyToolsHarness {
  list(path: string): AsyncResult<{ entries: string[] }>;
  read(
    path: string,
    options?: { maxBytes?: number },
  ): AsyncResult<{ content?: string; truncated?: boolean; binary?: boolean }>;
  search(query: string): AsyncResult<Array<{ path: string; line: number; text: string }>>;
  stat(path: string): AsyncResult<{ kind: string; size: number }>;
}

export function registerStep11ExtendedContract(): void {
  describe("step 11 - extended read-tool determinism", () => {
    it("returns directory and search results in stable order", async () => {
      await withTemporaryDirectory("agent-read-tools-extended", async (workspaceRoot) => {
        await mkdir(join(workspaceRoot, "src"), { recursive: true });
        await writeTextFile(join(workspaceRoot, "src", "zeta.ts"), "needle z\n");
        await writeTextFile(join(workspaceRoot, "src", "alpha.ts"), "needle a\n");
        const adapter = await loadStepAdapter("11");
        const createReadonlyTools = requireFunction<
          (root: string) => AsyncResult<ReadonlyToolsHarness>
        >(adapter, "createReadonlyTools");
        const tools = await createReadonlyTools(workspaceRoot);

        const firstList = await tools.list("src");
        const secondList = await tools.list("src");
        const firstSearch = await tools.search("needle");
        const secondSearch = await tools.search("needle");

        expect(firstList).toEqual(secondList);
        expect(firstList.entries).toEqual(["alpha.ts", "zeta.ts"]);
        expect(firstSearch).toEqual(secondSearch);
        expect(firstSearch.map((match) => match.path)).toEqual(["src/alpha.ts", "src/zeta.ts"]);
      });
    });

    it("preserves UTF-8 text and rejects wrong-kind operations", async () => {
      await withTemporaryDirectory("agent-read-tools-extended", async (workspaceRoot) => {
        await mkdir(join(workspaceRoot, "directory"), { recursive: true });
        await writeFile(join(workspaceRoot, "unicode.txt"), Buffer.from("你好🙂\n", "utf8"));
        const adapter = await loadStepAdapter("11");
        const createReadonlyTools = requireFunction<
          (root: string) => AsyncResult<ReadonlyToolsHarness>
        >(adapter, "createReadonlyTools");
        const tools = await createReadonlyTools(workspaceRoot);

        expect((await tools.read("unicode.txt")).content).toBe("你好🙂\n");
        await expect(invoke(() => tools.read("directory"))).rejects.toThrow();
        await expect(invoke(() => tools.list("unicode.txt"))).rejects.toThrow();
      });
    });
  });
}
