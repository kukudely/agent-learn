import { describe, expect, it } from "vitest";

import {
  invoke,
  loadStepAdapter,
  requireFunction,
  withTemporaryDirectory,
} from "../_support/step-test-kit.js";

type AsyncResult<T> = T | Promise<T>;

interface PatchScenarioResult {
  status: string;
  content?: string;
  beforeHash?: string;
  afterHash?: string;
  changed?: boolean;
  atomic?: boolean;
}

export function registerStep12Contract(): void {
  describe("step 12 - controlled writes and patches", () => {
    it("creates and updates files with content-addressed preconditions", async () => {
      await withTemporaryDirectory("agent-patch", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("12");
        const runPatchScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<PatchScenarioResult>
        >(adapter, "runPatchScenario");

        const created = await runPatchScenario(workspaceRoot, "create");
        const updated = await runPatchScenario(workspaceRoot, "compare-and-swap-update");

        expect(created).toMatchObject({
          status: "created",
          changed: true,
          atomic: true,
        });
        expect(created.afterHash).toMatch(/^[a-f0-9]{32,}$/i);
        expect(updated).toMatchObject({
          status: "updated",
          changed: true,
          atomic: true,
        });
        expect(updated.beforeHash).toBe(created.afterHash);
        expect(updated.afterHash).not.toBe(updated.beforeHash);
      });
    });

    it("does not mutate a file when the expected content is stale", async () => {
      await withTemporaryDirectory("agent-patch", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("12");
        const runPatchScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<PatchScenarioResult>
        >(adapter, "runPatchScenario");
        const result = await runPatchScenario(workspaceRoot, "stale-precondition");

        expect(result).toMatchObject({
          status: "conflict",
          changed: false,
        });
        expect(result.content).toBe("current content");
      });
    });

    it.each(["path-traversal", "symlink-escape"])("rejects %s before writing", async (scenario) => {
      await withTemporaryDirectory("agent-patch", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("12");
        const runPatchScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<PatchScenarioResult>
        >(adapter, "runPatchScenario");

        await expect(invoke(() => runPatchScenario(workspaceRoot, scenario))).rejects.toThrow();
      });
    });
  });
}

interface ShellScenarioResult {
  status: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  aborted?: boolean;
  activeProcessesAfter?: number;
  receivedArguments?: string[];
}

export function registerStep13Contract(): void {
  describe("step 13 - structured shell executor", () => {
    it("passes arguments without shell interpolation and captures both streams", async () => {
      const adapter = await loadStepAdapter("13");
      const runShellScenario = requireFunction<
        (scenario: string) => AsyncResult<ShellScenarioResult>
      >(adapter, "runShellScenario");
      const result = await runShellScenario("structured-arguments");

      expect(result.status).toBe("completed");
      expect(result.exitCode).toBe(0);
      expect(result.receivedArguments).toEqual([
        "plain",
        "space value",
        "$(not-executed)",
        "; still-an-argument",
      ]);
      expect(result.stdout).toContain("stdout");
      expect(result.stderr).toContain("stderr");
    });

    it("returns non-zero exits as structured results", async () => {
      const adapter = await loadStepAdapter("13");
      const runShellScenario = requireFunction<
        (scenario: string) => AsyncResult<ShellScenarioResult>
      >(adapter, "runShellScenario");
      const result = await runShellScenario("non-zero");

      expect(result.status).toBe("failed");
      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).not.toBe("");
    });

    it.each([
      ["timeout", "timedOut"],
      ["abort", "aborted"],
    ] as const)("terminates the process tree on %s", async (scenario, flag) => {
      const adapter = await loadStepAdapter("13");
      const runShellScenario = requireFunction<
        (scenario: string) => AsyncResult<ShellScenarioResult>
      >(adapter, "runShellScenario");
      const result = await runShellScenario(scenario);

      expect(result.status).toBe("cancelled");
      expect(result[flag]).toBe(true);
      expect(result.activeProcessesAfter).toBe(0);
    });
  });
}

interface PolicyScenarioResult {
  decision: "allow" | "ask" | "deny";
  executed: boolean;
  approvalRequests: number;
  matchedRule?: string;
  persistedScope?: string;
}

export function registerStep14Contract(): void {
  describe("step 14 - permissions and approvals", () => {
    it.each([
      ["explicit-allow", "allow", true, 0],
      ["explicit-deny", "deny", false, 0],
      ["ask-approved", "ask", true, 1],
      ["ask-denied", "ask", false, 1],
    ] as const)(
      "enforces the %s policy path",
      async (scenario, decision, executed, approvalRequests) => {
        const adapter = await loadStepAdapter("14");
        const runPolicyScenario = requireFunction<
          (scenario: string) => AsyncResult<PolicyScenarioResult>
        >(adapter, "runPolicyScenario");
        const result = await runPolicyScenario(scenario);

        expect(result).toMatchObject({
          decision,
          executed,
          approvalRequests,
        });
      },
    );

    it("uses deny-over-allow precedence for equally specific rules", async () => {
      const adapter = await loadStepAdapter("14");
      const runPolicyScenario = requireFunction<
        (scenario: string) => AsyncResult<PolicyScenarioResult>
      >(adapter, "runPolicyScenario");
      const result = await runPolicyScenario("conflicting-rules");

      expect(result.decision).toBe("deny");
      expect(result.executed).toBe(false);
      expect(result.matchedRule).not.toBe("");
    });

    it("distinguishes one-shot and session approval scopes", async () => {
      const adapter = await loadStepAdapter("14");
      const runPolicyScenario = requireFunction<
        (scenario: string) => AsyncResult<PolicyScenarioResult>
      >(adapter, "runPolicyScenario");

      expect((await runPolicyScenario("approve-once")).persistedScope).toBe("once");
      expect((await runPolicyScenario("approve-session")).persistedScope).toBe("session");
    });
  });
}

interface ReliabilityScenarioResult {
  status: string;
  attempts: number;
  modelCalls?: number;
  toolCalls?: number;
  sideEffectCount?: number;
  retryDelaysMs?: number[];
  activeOperationsAfter?: number;
}

export function registerStep15Contract(): void {
  describe("step 15 - cancellation, budgets, and retries", () => {
    it("checks budgets before starting the next operation", async () => {
      const adapter = await loadStepAdapter("15");
      const runReliabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ReliabilityScenarioResult>
      >(adapter, "runReliabilityScenario");
      const result = await runReliabilityScenario("max-steps");

      expect(result.status).toBe("budget_exhausted");
      expect(result.modelCalls).toBe(2);
      expect(result.toolCalls).toBe(1);
    });

    it("retries transient model failures but not permanent failures", async () => {
      const adapter = await loadStepAdapter("15");
      const runReliabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ReliabilityScenarioResult>
      >(adapter, "runReliabilityScenario");
      const transient = await runReliabilityScenario("rate-limit-then-success");
      const permanent = await runReliabilityScenario("bad-request");

      expect(transient.status).toBe("completed");
      expect(transient.attempts).toBe(3);
      expect(transient.retryDelaysMs).toHaveLength(2);
      expect(permanent.status).toBe("failed");
      expect(permanent.attempts).toBe(1);
    });

    it("never automatically retries an unknown side-effect outcome", async () => {
      const adapter = await loadStepAdapter("15");
      const runReliabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ReliabilityScenarioResult>
      >(adapter, "runReliabilityScenario");
      const result = await runReliabilityScenario("side-effect-unknown");

      expect(result.status).toBe("outcome_unknown");
      expect(result.attempts).toBe(1);
      expect(result.sideEffectCount).toBe(1);
    });

    it("aborts retry backoff and leaves no active operation", async () => {
      const adapter = await loadStepAdapter("15");
      const runReliabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ReliabilityScenarioResult>
      >(adapter, "runReliabilityScenario");
      const result = await runReliabilityScenario("abort-during-backoff");

      expect(result.status).toBe("cancelled");
      expect(result.activeOperationsAfter).toBe(0);
    });
  });
}

interface ToolBatchScenarioResult {
  status: string;
  maxConcurrency: number;
  completionOrder?: string[];
  resultOrder?: string[];
  maxConcurrentWrites?: number;
  resultStatuses?: string[];
  activeAfter?: number;
}

export function registerStep16Contract(): void {
  describe("step 16 - safe tool parallelism", () => {
    it("executes independent reads concurrently but commits results in call order", async () => {
      const adapter = await loadStepAdapter("16");
      const runToolBatchScenario = requireFunction<
        (scenario: string) => AsyncResult<ToolBatchScenarioResult>
      >(adapter, "runToolBatchScenario");
      const result = await runToolBatchScenario("reverse-completion");

      expect(result.status).toBe("completed");
      expect(result.maxConcurrency).toBeGreaterThanOrEqual(2);
      expect(result.completionOrder).toEqual(["second", "first"]);
      expect(result.resultOrder).toEqual(["first", "second"]);
    });

    it("serializes conflicting writes while allowing independent work", async () => {
      const adapter = await loadStepAdapter("16");
      const runToolBatchScenario = requireFunction<
        (scenario: string) => AsyncResult<ToolBatchScenarioResult>
      >(adapter, "runToolBatchScenario");
      const result = await runToolBatchScenario("write-conflict");

      expect(result.status).toBe("completed");
      expect(result.maxConcurrentWrites).toBe(1);
    });

    it("keeps ordinary tool failures as ordered results", async () => {
      const adapter = await loadStepAdapter("16");
      const runToolBatchScenario = requireFunction<
        (scenario: string) => AsyncResult<ToolBatchScenarioResult>
      >(adapter, "runToolBatchScenario");
      const result = await runToolBatchScenario("ordinary-error");

      expect(result.status).toBe("completed");
      expect(result.resultStatuses).toEqual(["ok", "error", "ok"]);
    });

    it("settles all started tasks after cancellation", async () => {
      const adapter = await loadStepAdapter("16");
      const runToolBatchScenario = requireFunction<
        (scenario: string) => AsyncResult<ToolBatchScenarioResult>
      >(adapter, "runToolBatchScenario");
      const result = await runToolBatchScenario("cancel");

      expect(result.status).toBe("cancelled");
      expect(result.activeAfter).toBe(0);
    });
  });
}

interface SessionProtocolScenarioResult {
  status: string;
  backend: "memory" | "jsonl";
  sequences?: number[];
  eventCount?: number;
  tail?: string;
  warnings?: string[];
  conflict?: boolean;
  secretExposed?: boolean;
  unknownTypePreserved?: boolean;
}

export function registerStep17Contract(): void {
  describe("step 17 - append-only session protocol", () => {
    it.each(["memory", "jsonl"] as const)(
      "passes append/load/reopen semantics for %s",
      async (backend) => {
        await withTemporaryDirectory("agent-session", async (workspaceRoot) => {
          const adapter = await loadStepAdapter("17");
          const runSessionProtocolScenario = requireFunction<
            (
              root: string,
              backend: "memory" | "jsonl",
              scenario: string,
            ) => AsyncResult<SessionProtocolScenarioResult>
          >(adapter, "runSessionProtocolScenario");
          const result = await runSessionProtocolScenario(
            workspaceRoot,
            backend,
            "append-load-reopen",
          );

          expect(result.status).toBe("loaded");
          expect(result.backend).toBe(backend);
          expect(result.sequences).toEqual([1, 2, 3]);
          expect(result.eventCount).toBe(3);
        });
      },
    );

    it("detects optimistic append conflicts", async () => {
      await withTemporaryDirectory("agent-session", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("17");
        const runSessionProtocolScenario = requireFunction<
          (
            root: string,
            backend: "memory" | "jsonl",
            scenario: string,
          ) => AsyncResult<SessionProtocolScenarioResult>
        >(adapter, "runSessionProtocolScenario");
        const result = await runSessionProtocolScenario(
          workspaceRoot,
          "jsonl",
          "expected-sequence-conflict",
        );

        expect(result.conflict).toBe(true);
        expect(result.eventCount).toBe(1);
      });
    });

    it("diagnoses a truncated tail without hiding complete-line corruption", async () => {
      await withTemporaryDirectory("agent-session", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("17");
        const runSessionProtocolScenario = requireFunction<
          (
            root: string,
            backend: "memory" | "jsonl",
            scenario: string,
          ) => AsyncResult<SessionProtocolScenarioResult>
        >(adapter, "runSessionProtocolScenario");
        const truncated = await runSessionProtocolScenario(
          workspaceRoot,
          "jsonl",
          "truncated-tail",
        );

        expect(truncated.tail).toBe("truncated");
        expect(truncated.warnings?.length).toBeGreaterThan(0);
        await expect(
          invoke(() => runSessionProtocolScenario(workspaceRoot, "jsonl", "corrupt-complete-line")),
        ).rejects.toThrow();
      });
    });

    it("redacts secrets and preserves unknown future events", async () => {
      await withTemporaryDirectory("agent-session", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("17");
        const runSessionProtocolScenario = requireFunction<
          (
            root: string,
            backend: "memory" | "jsonl",
            scenario: string,
          ) => AsyncResult<SessionProtocolScenarioResult>
        >(adapter, "runSessionProtocolScenario");
        const result = await runSessionProtocolScenario(
          workspaceRoot,
          "jsonl",
          "redaction-and-unknown-event",
        );

        expect(result.secretExposed).toBe(false);
        expect(result.unknownTypePreserved).toBe(true);
      });
    });
  });
}
