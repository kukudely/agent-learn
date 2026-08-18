import { describe, expect, it } from "vitest";

import {
  invoke,
  loadStepAdapter,
  requireFunction,
  withTemporaryDirectory,
} from "../_support/step-test-kit.js";

type AsyncResult<T> = T | Promise<T>;

interface ExtendedPatchResult {
  status: string;
  content?: string;
  changed?: boolean;
  matchCount?: number;
  tempArtifactsAfter?: number;
  encoding?: string;
}

export function registerStep12ExtendedContract(): void {
  describe("step 12 - extended write and patch failures", () => {
    it.each([
      ["zero-match", 0],
      ["multiple-match", 2],
    ] as const)("rejects ambiguous replacement preconditions: %s", async (scenario, matchCount) => {
      await withTemporaryDirectory("agent-patch-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("12");
        const runPatchScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<ExtendedPatchResult>
        >(adapter, "runPatchScenario");
        const result = await runPatchScenario(workspaceRoot, scenario);

        expect(result.status).toBe("conflict");
        expect(result.matchCount).toBe(matchCount);
        expect(result.changed).toBe(false);
      });
    });

    it("leaves the original file and no temporary artifact after an atomic-write failure", async () => {
      await withTemporaryDirectory("agent-patch-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("12");
        const runPatchScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<ExtendedPatchResult>
        >(adapter, "runPatchScenario");
        const result = await runPatchScenario(workspaceRoot, "atomic-write-failure");

        expect(result.status).toBe("failed");
        expect(result.changed).toBe(false);
        expect(result.content).toBe("original content");
        expect(result.tempArtifactsAfter).toBe(0);
      });
    });

    it("preserves UTF-8 content exactly", async () => {
      await withTemporaryDirectory("agent-patch-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("12");
        const runPatchScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<ExtendedPatchResult>
        >(adapter, "runPatchScenario");
        const result = await runPatchScenario(workspaceRoot, "utf8-content");

        expect(result.status).toBe("updated");
        expect(result.content).toBe("你好\n🙂\n");
        expect(result.encoding).toBe("utf8");
      });
    });
  });
}

interface ExtendedShellResult {
  status: string;
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
  outputBytes?: number;
  outputLimitBytes?: number;
  allowedEnvironmentVisible?: boolean;
  secretEnvironmentVisible?: boolean;
  activeProcessesAfter?: number;
}

export function registerStep13ExtendedContract(): void {
  describe("step 13 - extended shell isolation and limits", () => {
    it("enforces a combined output limit without leaking a child process", async () => {
      const adapter = await loadStepAdapter("13");
      const runShellScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedShellResult>
      >(adapter, "runShellScenario");
      const result = await runShellScenario("output-limit");

      expect(result.status).toBe("cancelled");
      expect(result.truncated).toBe(true);
      expect(result.outputBytes).toBeLessThanOrEqual(result.outputLimitBytes ?? 0);
      expect(result.activeProcessesAfter).toBe(0);
    });

    it("passes allowlisted environment entries and hides inherited secrets", async () => {
      const adapter = await loadStepAdapter("13");
      const runShellScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedShellResult>
      >(adapter, "runShellScenario");
      const result = await runShellScenario("environment-filter");

      expect(result.status).toBe("completed");
      expect(result.allowedEnvironmentVisible).toBe(true);
      expect(result.secretEnvironmentVisible).toBe(false);
    });

    it.each(["missing-executable", "invalid-cwd"])(
      "normalizes startup failure for %s",
      async (scenario) => {
        const adapter = await loadStepAdapter("13");
        const runShellScenario = requireFunction<
          (scenario: string) => AsyncResult<ExtendedShellResult>
        >(adapter, "runShellScenario");
        const result = await runShellScenario(scenario);

        expect(result.status).toBe("failed");
        expect(result.activeProcessesAfter).toBe(0);
        expect(result.stderr).not.toBe("");
      },
    );
  });
}

interface ExtendedPolicyResult {
  status?: string;
  decision: "allow" | "ask" | "deny";
  executed: boolean;
  approvalRequests: number;
  persistedScope?: string;
}

export function registerStep14ExtendedContract(): void {
  describe("step 14 - extended approval lifecycle", () => {
    it("persists an explicitly approved project scope", async () => {
      const adapter = await loadStepAdapter("14");
      const runPolicyScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedPolicyResult>
      >(adapter, "runPolicyScenario");
      const result = await runPolicyScenario("approve-project");

      expect(result.decision).toBe("ask");
      expect(result.executed).toBe(true);
      expect(result.approvalRequests).toBe(1);
      expect(result.persistedScope).toBe("project");
    });

    it("cancels a pending approval without executing the capability", async () => {
      const adapter = await loadStepAdapter("14");
      const runPolicyScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedPolicyResult>
      >(adapter, "runPolicyScenario");
      const result = await runPolicyScenario("approval-cancelled");

      expect(result.status).toBe("cancelled");
      expect(result.decision).toBe("ask");
      expect(result.executed).toBe(false);
    });

    it("fails closed when policy evaluation itself fails", async () => {
      const adapter = await loadStepAdapter("14");
      const runPolicyScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedPolicyResult>
      >(adapter, "runPolicyScenario");
      const result = await runPolicyScenario("policy-engine-failure");

      expect(result.status).toBe("failed_closed");
      expect(result.decision).toBe("deny");
      expect(result.executed).toBe(false);
      expect(result.approvalRequests).toBe(0);
    });
  });
}

interface ExtendedReliabilityResult {
  status: string;
  modelCalls?: number;
  toolCalls?: number;
  outputBytes?: number;
  terminalEvents?: number;
  activeOperationsAfter?: number;
}

export function registerStep15ExtendedContract(): void {
  describe("step 15 - extended budgets and timeout races", () => {
    it.each([
      ["model-call-budget", "modelCalls"],
      ["tool-call-budget", "toolCalls"],
      ["output-budget", "outputBytes"],
    ] as const)("enforces %s before the next operation", async (scenario, counter) => {
      const adapter = await loadStepAdapter("15");
      const runReliabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedReliabilityResult>
      >(adapter, "runReliabilityScenario");
      const result = await runReliabilityScenario(scenario);

      expect(result.status).toBe("budget_exhausted");
      expect(result[counter]).toBeGreaterThan(0);
    });

    it("enforces the wall-time budget and settles active work", async () => {
      const adapter = await loadStepAdapter("15");
      const runReliabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedReliabilityResult>
      >(adapter, "runReliabilityScenario");
      const result = await runReliabilityScenario("wall-timeout");

      expect(result.status).toBe("timed_out");
      expect(result.activeOperationsAfter).toBe(0);
    });

    it("emits one terminal event when timeout and cancellation race", async () => {
      const adapter = await loadStepAdapter("15");
      const runReliabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedReliabilityResult>
      >(adapter, "runReliabilityScenario");
      const result = await runReliabilityScenario("cancel-timeout-race");

      expect(["cancelled", "timed_out"]).toContain(result.status);
      expect(result.terminalEvents).toBe(1);
      expect(result.activeOperationsAfter).toBe(0);
    });
  });
}

interface ExtendedBatchResult {
  status: string;
  maxConcurrency?: number;
  maxConcurrentWrites?: number;
  startedBeforeDecision?: number;
  activeAfter?: number;
  locksAfter?: number;
}

export function registerStep16ExtendedContract(): void {
  describe("step 16 - extended scheduling safety", () => {
    it("allows independent reads while serializing a conflicting write", async () => {
      const adapter = await loadStepAdapter("16");
      const runToolBatchScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedBatchResult>
      >(adapter, "runToolBatchScenario");
      const result = await runToolBatchScenario("mixed-read-write");

      expect(result.status).toBe("completed");
      expect(result.maxConcurrency).toBeGreaterThanOrEqual(2);
      expect(result.maxConcurrentWrites).toBe(1);
    });

    it("starts no tool before every required approval has a decision", async () => {
      const adapter = await loadStepAdapter("16");
      const runToolBatchScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedBatchResult>
      >(adapter, "runToolBatchScenario");
      const result = await runToolBatchScenario("approval-gate");

      expect(result.status).toBe("completed");
      expect(result.startedBeforeDecision).toBe(0);
    });

    it("cancels a task waiting for a resource lock and releases all leases", async () => {
      const adapter = await loadStepAdapter("16");
      const runToolBatchScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedBatchResult>
      >(adapter, "runToolBatchScenario");
      const result = await runToolBatchScenario("cancel-waiting-lock");

      expect(result.status).toBe("cancelled");
      expect(result.activeAfter).toBe(0);
      expect(result.locksAfter).toBe(0);
    });
  });
}

interface ExtendedSessionResult {
  status: string;
  migrated?: boolean;
  schemaVersion?: number;
  activeHandlesAfter?: number;
  eventCount?: number;
}

export function registerStep17ExtendedContract(): void {
  describe("step 17 - extended repository corruption and migration", () => {
    it.each(["duplicate-id", "dangling-parent", "future-version"])(
      "rejects invalid persisted state: %s",
      async (scenario) => {
        await withTemporaryDirectory("agent-session-extended", async (workspaceRoot) => {
          const adapter = await loadStepAdapter("17");
          const runSessionProtocolScenario = requireFunction<
            (
              root: string,
              backend: "memory" | "jsonl",
              scenario: string,
            ) => AsyncResult<ExtendedSessionResult>
          >(adapter, "runSessionProtocolScenario");

          await expect(
            invoke(() => runSessionProtocolScenario(workspaceRoot, "jsonl", scenario)),
          ).rejects.toThrow();
        });
      },
    );

    it("migrates a supported older event version before reducing state", async () => {
      await withTemporaryDirectory("agent-session-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("17");
        const runSessionProtocolScenario = requireFunction<
          (
            root: string,
            backend: "memory" | "jsonl",
            scenario: string,
          ) => AsyncResult<ExtendedSessionResult>
        >(adapter, "runSessionProtocolScenario");
        const result = await runSessionProtocolScenario(
          workspaceRoot,
          "jsonl",
          "supported-migration",
        );

        expect(result.status).toBe("loaded");
        expect(result.migrated).toBe(true);
        expect(result.schemaVersion).toBeGreaterThan(1);
      });
    });

    it("reports disk failure and releases the repository handle", async () => {
      await withTemporaryDirectory("agent-session-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("17");
        const runSessionProtocolScenario = requireFunction<
          (
            root: string,
            backend: "memory" | "jsonl",
            scenario: string,
          ) => AsyncResult<ExtendedSessionResult>
        >(adapter, "runSessionProtocolScenario");
        const result = await runSessionProtocolScenario(
          workspaceRoot,
          "jsonl",
          "disk-write-failure",
        );

        expect(result.status).toBe("failed");
        expect(result.eventCount).toBe(0);
        expect(result.activeHandlesAfter).toBe(0);
      });
    });
  });
}

interface ExtendedRecoveryResult {
  status: string;
  modelCalls: number;
  toolCalls: number;
  sourceSessionId?: string;
  sourceEventId?: string;
  importAtomic?: boolean;
}

export function registerStep18ExtendedContract(): void {
  describe("step 18 - extended recovery graph operations", () => {
    it.each(["invalid-transition", "cyclic-graph", "dangling-parent"])(
      "rejects invalid reducer or graph input: %s",
      async (scenario) => {
        const adapter = await loadStepAdapter("18");
        const runRecoveryScenario = requireFunction<
          (scenario: string) => AsyncResult<ExtendedRecoveryResult>
        >(adapter, "runRecoveryScenario");

        await expect(invoke(() => runRecoveryScenario(scenario))).rejects.toThrow();
      },
    );

    it("clones into a new session and retains provenance", async () => {
      const adapter = await loadStepAdapter("18");
      const runRecoveryScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedRecoveryResult>
      >(adapter, "runRecoveryScenario");
      const result = await runRecoveryScenario("clone");

      expect(result.status).toBe("cloned");
      expect(result.sourceSessionId).not.toBe("");
      expect(result.sourceEventId).not.toBe("");
      expect(result.modelCalls).toBe(0);
      expect(result.toolCalls).toBe(0);
    });

    it("validates an import completely before committing it", async () => {
      const adapter = await loadStepAdapter("18");
      const runRecoveryScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedRecoveryResult>
      >(adapter, "runRecoveryScenario");
      const valid = await runRecoveryScenario("valid-import");

      expect(valid.status).toBe("imported");
      expect(valid.importAtomic).toBe(true);
      await expect(invoke(() => runRecoveryScenario("invalid-import"))).rejects.toThrow();
    });
  });
}

interface ExtendedContextResult {
  status: string;
  includedIds?: string[];
  droppedIds?: string[];
  replacedIds?: string[];
  toolPairsValid?: boolean;
  estimatedTokens?: number;
  budget?: number;
}

export function registerStep19ExtendedContract(): void {
  describe("step 19 - extended context selection", () => {
    it("selects only the active branch", async () => {
      const adapter = await loadStepAdapter("19");
      const buildContextScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedContextResult>
      >(adapter, "buildContextScenario");
      const result = await buildContextScenario("branch-isolation");

      expect(result.status).toBe("built");
      expect(result.includedIds).toContain("active-branch-message");
      expect(result.includedIds).not.toContain("inactive-branch-message");
      expect(result.droppedIds).toContain("inactive-branch-message");
    });

    it("accepts required groups exactly at the token boundary", async () => {
      const adapter = await loadStepAdapter("19");
      const buildContextScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedContextResult>
      >(adapter, "buildContextScenario");
      const result = await buildContextScenario("exact-budget-boundary");

      expect(result.status).toBe("built");
      expect(result.estimatedTokens).toBe(result.budget);
    });

    it("replaces a large tool result with a persisted artifact reference as one pair", async () => {
      const adapter = await loadStepAdapter("19");
      const buildContextScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedContextResult>
      >(adapter, "buildContextScenario");
      const result = await buildContextScenario("large-tool-result");

      expect(result.status).toBe("built");
      expect(result.replacedIds).toContain("large-tool-result");
      expect(result.toolPairsValid).toBe(true);
      expect(result.estimatedTokens).toBeLessThanOrEqual(result.budget ?? 0);
    });
  });
}

interface ExtendedCompactionResult {
  status: string;
  shouldCompact?: boolean;
  triggerCount?: number;
  compactionEventWritten?: boolean;
  originalEventsUnchanged?: boolean;
  duplicateCoverageIds?: string[];
}

export function registerStep20ExtendedContract(): void {
  describe("step 20 - extended compaction triggering", () => {
    it.each([
      ["below-threshold", false],
      ["above-threshold", true],
      ["inside-hysteresis", false],
    ] as const)("evaluates the %s trigger deterministically", async (scenario, shouldCompact) => {
      const adapter = await loadStepAdapter("20");
      const runCompactionScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedCompactionResult>
      >(adapter, "runCompactionScenario");
      const result = await runCompactionScenario(scenario);

      expect(result.shouldCompact).toBe(shouldCompact);
    });

    it("cancels compaction without writing a partial summary", async () => {
      const adapter = await loadStepAdapter("20");
      const runCompactionScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedCompactionResult>
      >(adapter, "runCompactionScenario");
      const result = await runCompactionScenario("cancel-compaction");

      expect(result.status).toBe("cancelled");
      expect(result.compactionEventWritten).toBe(false);
      expect(result.originalEventsUnchanged).toBe(true);
    });

    it("does not duplicate coverage across consecutive compactions", async () => {
      const adapter = await loadStepAdapter("20");
      const runCompactionScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedCompactionResult>
      >(adapter, "runCompactionScenario");
      const result = await runCompactionScenario("consecutive-compactions");

      expect(result.status).toBe("compacted");
      expect(result.triggerCount).toBe(2);
      expect(result.duplicateCoverageIds).toEqual([]);
    });
  });
}

interface ExtendedConfigResult {
  status: string;
  value?: unknown;
  resolvedPath?: string;
  selectedSource?: string;
  sourceHistory?: string[];
  secretSerialized?: boolean;
}

export function registerStep21ExtendedContract(): void {
  describe("step 21 - extended config semantics", () => {
    it("uses recursive object merge, array replacement, explicit append, and explicit clear", async () => {
      const adapter = await loadStepAdapter("21");
      const runConfigScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedConfigResult>
      >(adapter, "runConfigScenario");
      const result = await runConfigScenario("merge-semantics");

      expect(result.status).toBe("resolved");
      expect(result.value).toEqual({
        object: { inherited: true, overridden: true },
        replacedArray: ["project"],
        appendedArray: ["default", "project"],
        clearedArray: [],
      });
    });

    it("resolves a relative path against the source file directory", async () => {
      const adapter = await loadStepAdapter("21");
      const runConfigScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedConfigResult>
      >(adapter, "runConfigScenario");
      const result = await runConfigScenario("source-relative-path");

      expect(result.status).toBe("resolved");
      expect(result.resolvedPath).toMatch(/config-source[\\/]skills$/);
    });

    it("explains the selected value without exposing a secret", async () => {
      const adapter = await loadStepAdapter("21");
      const runConfigScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedConfigResult>
      >(adapter, "runConfigScenario");
      const result = await runConfigScenario("explain-secret");

      expect(result.selectedSource).not.toBe("");
      expect(result.sourceHistory?.length).toBeGreaterThan(0);
      expect(result.secretSerialized).toBe(false);
    });

    it("rejects malformed and unknown configuration", async () => {
      const adapter = await loadStepAdapter("21");
      const runConfigScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedConfigResult>
      >(adapter, "runConfigScenario");

      for (const scenario of ["malformed-config", "unknown-field"]) {
        await expect(invoke(() => runConfigScenario(scenario))).rejects.toThrow();
      }
    });
  });
}

interface ExtendedProviderResult {
  providers: Array<{
    id: string;
    passedScenarios: string[];
    secretsExposed: boolean;
  }>;
}

export function registerStep22ExtendedContract(): void {
  describe("step 22 - extended provider conformance", () => {
    it("covers multi-tool, mixed content, usage, server failure, overflow, and capabilities", async () => {
      const adapter = await loadStepAdapter("22");
      const runProviderConformance = requireFunction<() => AsyncResult<ExtendedProviderResult>>(
        adapter,
        "runProviderConformance",
      );
      const result = await runProviderConformance();
      const extendedScenarios = [
        "multi-tool",
        "mixed-content",
        "server-error",
        "context-overflow",
        "usage",
        "vision-capability",
        "structured-output-capability",
      ];

      for (const provider of result.providers) {
        expect(provider.passedScenarios).toEqual(expect.arrayContaining(extendedScenarios));
        expect(provider.secretsExposed).toBe(false);
      }
    });
  });
}

interface ExtendedSkillResult {
  status: string;
  instructionOrder?: string[];
  sourcesRecorded?: boolean;
  winner?: string;
  invalidSkills?: string[];
  projectSkillLoaded?: boolean;
}

export function registerStep23ExtendedContract(): void {
  describe("step 23 - extended instruction and skill security", () => {
    it("orders managed, user, and root-to-cwd project instructions with provenance", async () => {
      await withTemporaryDirectory("agent-skills-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("23");
        const runSkillScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<ExtendedSkillResult>
        >(adapter, "runSkillScenario");
        const result = await runSkillScenario(workspaceRoot, "instruction-precedence");

        expect(result.status).toBe("loaded");
        expect(result.instructionOrder).toEqual(["managed", "user", "project-root", "project-cwd"]);
        expect(result.sourcesRecorded).toBe(true);
      });
    });

    it("marks same-priority duplicate skills invalid instead of picking by scan order", async () => {
      await withTemporaryDirectory("agent-skills-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("23");
        const runSkillScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<ExtendedSkillResult>
        >(adapter, "runSkillScenario");
        const result = await runSkillScenario(workspaceRoot, "same-priority-duplicate");

        expect(result.status).toBe("discovered");
        expect(result.winner).toBeUndefined();
        expect(result.invalidSkills).toEqual(["first/example", "second/example"]);
      });
    });

    it.each(["bad-encoding", "archive-symlink", "archive-bomb"])(
      "isolates or rejects the hostile skill case %s",
      async (scenario) => {
        await withTemporaryDirectory("agent-skills-extended", async (workspaceRoot) => {
          const adapter = await loadStepAdapter("23");
          const runSkillScenario = requireFunction<
            (root: string, scenario: string) => AsyncResult<ExtendedSkillResult>
          >(adapter, "runSkillScenario");

          await expect(invoke(() => runSkillScenario(workspaceRoot, scenario))).rejects.toThrow();
        });
      },
    );
  });
}
