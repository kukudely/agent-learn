import { describe, expect, it } from "vitest";

import {
  loadStepAdapter,
  requireFunction,
  withTemporaryDirectory,
} from "../_support/step-test-kit.js";

type AsyncResult<T> = T | Promise<T>;

interface ExtendedMcpResult {
  status: string;
  tools?: string[];
  registeredTools?: number;
  registryUpdateAtomic?: boolean;
  executed?: boolean;
  policyDecision?: string;
  bytesRead?: number;
  byteLimit?: number;
  activeRequestsAfter?: number;
}

export function registerStep24ExtendedContract(): void {
  describe("step 24 - extended MCP lifecycle and policy", () => {
    it("atomically refreshes tools after a list-changed notification", async () => {
      const adapter = await loadStepAdapter("24");
      const runMcpScenario = requireFunction<(scenario: string) => AsyncResult<ExtendedMcpResult>>(
        adapter,
        "runMcpScenario",
      );
      const result = await runMcpScenario("tools-list-changed");

      expect(result.status).toBe("completed");
      expect(result.registryUpdateAtomic).toBe(true);
      expect(result.tools).toEqual(["mcp:fake:new_tool"]);
    });

    it("does not register a malformed remote tool schema", async () => {
      const adapter = await loadStepAdapter("24");
      const runMcpScenario = requireFunction<(scenario: string) => AsyncResult<ExtendedMcpResult>>(
        adapter,
        "runMcpScenario",
      );
      const result = await runMcpScenario("malformed-tool-schema");

      expect(result.status).toBe("failed");
      expect(result.registeredTools).toBe(0);
    });

    it("routes an MCP tool through local policy before sending tools/call", async () => {
      const adapter = await loadStepAdapter("24");
      const runMcpScenario = requireFunction<(scenario: string) => AsyncResult<ExtendedMcpResult>>(
        adapter,
        "runMcpScenario",
      );
      const result = await runMcpScenario("permission-denied");

      expect(result.policyDecision).toBe("deny");
      expect(result.executed).toBe(false);
      expect(result.activeRequestsAfter).toBe(0);
    });

    it("enforces resource output limits", async () => {
      const adapter = await loadStepAdapter("24");
      const runMcpScenario = requireFunction<(scenario: string) => AsyncResult<ExtendedMcpResult>>(
        adapter,
        "runMcpScenario",
      );
      const result = await runMcpScenario("oversized-resource");

      expect(result.status).toBe("failed");
      expect(result.bytesRead).toBeLessThanOrEqual(result.byteLimit ?? 0);
    });
  });
}

interface ExtendedPluginResult {
  status: string;
  hookOrder?: string[];
  executed?: boolean;
  activePlugins?: string[];
  failedPlugins?: string[];
  entrypointsExecuted?: number;
  policyBypassed?: boolean;
}

export function registerStep25ExtendedContract(): void {
  describe("step 25 - extended plugin hooks and pure mode", () => {
    it("runs hooks by priority and stable plugin ID", async () => {
      await withTemporaryDirectory("agent-plugins-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("25");
        const runPluginScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<ExtendedPluginResult>
        >(adapter, "runPluginScenario");
        const result = await runPluginScenario(workspaceRoot, "hook-order");

        expect(result.status).toBe("completed");
        expect(result.hookOrder).toEqual([
          "high.alpha:before",
          "high.beta:before",
          "tool",
          "high.beta:after",
          "high.alpha:after",
        ]);
      });
    });

    it("lets a before hook block execution but not execute a side effect itself", async () => {
      await withTemporaryDirectory("agent-plugins-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("25");
        const runPluginScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<ExtendedPluginResult>
        >(adapter, "runPluginScenario");
        const result = await runPluginScenario(workspaceRoot, "before-hook-block");

        expect(result.status).toBe("blocked");
        expect(result.executed).toBe(false);
      });
    });

    it("isolates a throwing hook and preserves healthy plugins", async () => {
      await withTemporaryDirectory("agent-plugins-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("25");
        const runPluginScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<ExtendedPluginResult>
        >(adapter, "runPluginScenario");
        const result = await runPluginScenario(workspaceRoot, "hook-error");

        expect(result.status).toBe("partially_active");
        expect(result.failedPlugins).toContain("throwing.plugin");
        expect(result.activePlugins).toContain("healthy.plugin");
      });
    });

    it.each(["incompatible-host", "pure-mode"])(
      "executes no external entrypoint for %s",
      async (scenario) => {
        await withTemporaryDirectory("agent-plugins-extended", async (workspaceRoot) => {
          const adapter = await loadStepAdapter("25");
          const runPluginScenario = requireFunction<
            (root: string, scenario: string) => AsyncResult<ExtendedPluginResult>
          >(adapter, "runPluginScenario");
          const result = await runPluginScenario(workspaceRoot, scenario);

          expect(result.entrypointsExecuted).toBe(0);
          expect(result.activePlugins).toEqual([]);
        });
      },
    );

    it("does not expose a policy-bypass capability to plugins", async () => {
      await withTemporaryDirectory("agent-plugins-extended", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("25");
        const runPluginScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<ExtendedPluginResult>
        >(adapter, "runPluginScenario");
        const result = await runPluginScenario(workspaceRoot, "permission-bypass-attempt");

        expect(result.policyBypassed).toBe(false);
        expect(result.executed).toBe(false);
      });
    });
  });
}

interface ExtendedInteractionResult {
  status: string;
  consumedUserInputs?: string[];
  pendingQuestionId?: string;
  answerRecorded?: boolean;
  pendingInputCount?: number;
  planRevision?: number;
}

export function registerStep26ExtendedContract(): void {
  describe("step 26 - extended questions and queues", () => {
    it("consumes multiple follow-ups in FIFO order after the current run", async () => {
      const adapter = await loadStepAdapter("26");
      const runInteractionScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedInteractionResult>
      >(adapter, "runInteractionScenario");
      const result = await runInteractionScenario("multiple-follow-ups");

      expect(result.status).toBe("completed");
      expect(result.consumedUserInputs).toEqual(["current", "follow-up-1", "follow-up-2"]);
      expect(result.pendingInputCount).toBe(0);
    });

    it.each([
      ["question-answered", "completed"],
      ["question-rejected", "rejected"],
      ["question-cancelled", "cancelled"],
    ] as const)("records the %s lifecycle", async (scenario, status) => {
      const adapter = await loadStepAdapter("26");
      const runInteractionScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedInteractionResult>
      >(adapter, "runInteractionScenario");
      const result = await runInteractionScenario(scenario);

      expect(result.status).toBe(status);
      expect(result.pendingQuestionId).not.toBe("");
      expect(result.answerRecorded).toBe(true);
    });

    it("does not wait forever for a question in non-interactive mode", async () => {
      const adapter = await loadStepAdapter("26");
      const runInteractionScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedInteractionResult>
      >(adapter, "runInteractionScenario");
      const result = await runInteractionScenario("non-interactive-question");

      expect(["defaulted", "failed"]).toContain(result.status);
      expect(result.pendingInputCount).toBe(0);
    });

    it("rebuilds a pending question and plan revision from persisted events", async () => {
      const adapter = await loadStepAdapter("26");
      const runInteractionScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedInteractionResult>
      >(adapter, "runInteractionScenario");
      const result = await runInteractionScenario("recover-pending-question");

      expect(result.status).toBe("waiting_for_input");
      expect(result.pendingQuestionId).toBe("question-1");
      expect(result.planRevision).toBe(3);
    });
  });
}

interface ExtendedMultiAgentResult {
  status: string;
  maxConcurrency?: number;
  historiesIsolated?: boolean;
  siblingCompleted?: boolean;
  activeChildrenAfter?: number;
  totalBudgetExceeded?: boolean;
  writeConflictDetected?: boolean;
  recoveredAgentIds?: string[];
}

export function registerStep27ExtendedContract(): void {
  describe("step 27 - extended agent-tree isolation", () => {
    it("runs independent children concurrently with isolated histories", async () => {
      const adapter = await loadStepAdapter("27");
      const runMultiAgentScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedMultiAgentResult>
      >(adapter, "runMultiAgentScenario");
      const result = await runMultiAgentScenario("parallel-children");

      expect(result.status).toBe("completed");
      expect(result.maxConcurrency).toBe(2);
      expect(result.historiesIsolated).toBe(true);
    });

    it("keeps a healthy sibling after one child fails", async () => {
      const adapter = await loadStepAdapter("27");
      const runMultiAgentScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedMultiAgentResult>
      >(adapter, "runMultiAgentScenario");
      const result = await runMultiAgentScenario("child-failure");

      expect(result.status).toBe("partially_completed");
      expect(result.siblingCompleted).toBe(true);
    });

    it("settles a timed-out child and enforces the aggregate budget", async () => {
      const adapter = await loadStepAdapter("27");
      const runMultiAgentScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedMultiAgentResult>
      >(adapter, "runMultiAgentScenario");
      const timeout = await runMultiAgentScenario("child-timeout");
      const budget = await runMultiAgentScenario("total-budget");

      expect(timeout.status).toBe("timed_out");
      expect(timeout.activeChildrenAfter).toBe(0);
      expect(budget.totalBudgetExceeded).toBe(true);
    });

    it("detects a conflicting child write and restores the persisted tree", async () => {
      const adapter = await loadStepAdapter("27");
      const runMultiAgentScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedMultiAgentResult>
      >(adapter, "runMultiAgentScenario");
      const conflict = await runMultiAgentScenario("child-write-conflict");
      const recovered = await runMultiAgentScenario("recover-agent-tree");

      expect(conflict.writeConflictDetected).toBe(true);
      expect(recovered.recoveredAgentIds).toEqual(["parent", "child-1", "child-2"]);
    });
  });
}

interface ExtendedServerResult {
  status: string;
  transportSnapshotsEqual?: boolean;
  maxSameSessionConcurrency?: number;
  maxCrossSessionConcurrency?: number;
  workspaceEscapeSucceeded?: boolean;
  interrupted?: boolean;
  activeRunsAfterDisconnect?: number;
}

export function registerStep28ExtendedContract(): void {
  describe("step 28 - extended server concurrency and transports", () => {
    it("passes the same command/event contract in-process and remotely", async () => {
      const adapter = await loadStepAdapter("28");
      const runServerScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedServerResult>
      >(adapter, "runServerScenario");
      const result = await runServerScenario("transport-conformance");

      expect(result.status).toBe("completed");
      expect(result.transportSnapshotsEqual).toBe(true);
    });

    it("serializes one session while allowing different sessions to overlap", async () => {
      const adapter = await loadStepAdapter("28");
      const runServerScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedServerResult>
      >(adapter, "runServerScenario");
      const result = await runServerScenario("session-concurrency");

      expect(result.maxSameSessionConcurrency).toBe(1);
      expect(result.maxCrossSessionConcurrency).toBeGreaterThanOrEqual(2);
    });

    it("keeps each session bound to its own workspace", async () => {
      const adapter = await loadStepAdapter("28");
      const runServerScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedServerResult>
      >(adapter, "runServerScenario");
      const result = await runServerScenario("workspace-isolation");

      expect(result.workspaceEscapeSucceeded).toBe(false);
    });

    it("propagates interrupt through the transport and settles the run", async () => {
      const adapter = await loadStepAdapter("28");
      const runServerScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedServerResult>
      >(adapter, "runServerScenario");
      const result = await runServerScenario("interrupt-propagation");

      expect(result.status).toBe("cancelled");
      expect(result.interrupted).toBe(true);
      expect(result.activeRunsAfterDisconnect).toBe(0);
    });
  });
}

interface ExtendedClientResult {
  status: string;
  reducerFingerprints?: string[];
  unknownEventsPreserved?: boolean;
  duplicateEventsApplied?: number;
  replayedSequence?: number[];
  commandsSent?: string[];
  transportSnapshotsEqual?: boolean;
}

export function registerStep29ExtendedContract(): void {
  describe("step 29 - extended client reducer and reconnect", () => {
    it("reduces a recording deterministically and tolerates unknown events", async () => {
      const adapter = await loadStepAdapter("29");
      const runClientScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedClientResult>
      >(adapter, "runClientScenario");
      const result = await runClientScenario("reducer-recording");

      expect(new Set(result.reducerFingerprints).size).toBe(1);
      expect(result.unknownEventsPreserved).toBe(true);
      expect(result.duplicateEventsApplied).toBe(0);
    });

    it("resumes from the last cursor without duplicate rendering", async () => {
      const adapter = await loadStepAdapter("29");
      const runClientScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedClientResult>
      >(adapter, "runClientScenario");
      const result = await runClientScenario("reconnect");

      expect(result.status).toBe("completed");
      expect(result.replayedSequence).toEqual([4, 5, 6]);
      expect(result.duplicateEventsApplied).toBe(0);
    });

    it("maps approval and question actions to protocol commands", async () => {
      const adapter = await loadStepAdapter("29");
      const runClientScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedClientResult>
      >(adapter, "runClientScenario");
      const result = await runClientScenario("approval-and-question");

      expect(result.commandsSent).toEqual(["approval.reply", "question.reply", "question.cancel"]);
    });

    it("keeps local and remote transport view models equal", async () => {
      const adapter = await loadStepAdapter("29");
      const runClientScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedClientResult>
      >(adapter, "runClientScenario");
      const result = await runClientScenario("transport-parity");

      expect(result.transportSnapshotsEqual).toBe(true);
    });
  });
}

interface ExtendedSandboxResult {
  backends: Array<{
    name: string;
    passedScenarios: string[];
  }>;
  localFallbackUsed?: boolean;
  reapprovalRequested?: boolean;
  activeProcessesAfter: number;
}

export function registerStep30ExtendedContract(): void {
  describe("step 30 - extended sandbox threat model", () => {
    it("covers filesystem, network, symlink, subprocess, and resource boundaries", async () => {
      const adapter = await loadStepAdapter("30");
      const runSandboxConformance = requireFunction<() => AsyncResult<ExtendedSandboxResult>>(
        adapter,
        "runSandboxConformance",
      );
      const result = await runSandboxConformance();
      const securityScenarios = [
        "read-denied",
        "write-denied",
        "network-denied",
        "symlink-escape",
        "subprocess-containment",
        "resource-exhaustion",
      ];

      for (const backend of result.backends) {
        expect(backend.passedScenarios).toEqual(expect.arrayContaining(securityScenarios));
      }
      expect(result.activeProcessesAfter).toBe(0);
    });

    it("does not fall back to local execution and requires reapproval for escalation", async () => {
      const adapter = await loadStepAdapter("30");
      const runSandboxConformance = requireFunction<() => AsyncResult<ExtendedSandboxResult>>(
        adapter,
        "runSandboxConformance",
      );
      const result = await runSandboxConformance();

      expect(result.localFallbackUsed).toBe(false);
      expect(result.reapprovalRequested).toBe(true);
    });
  });
}

interface ExtendedObservabilityResult {
  status: string;
  allSpansClosed?: boolean;
  traceIds?: string[];
  loggedBytes?: number;
  logLimitBytes?: number;
  artifactReference?: string;
  agentParentLinksValid?: boolean;
  secretExposed?: boolean;
}

export function registerStep31ExtendedContract(): void {
  describe("step 31 - extended failure traces", () => {
    it.each(["provider-failure", "tool-failure", "policy-denial", "cancelled-run"])(
      "closes a correlated trace for %s",
      async (scenario) => {
        const adapter = await loadStepAdapter("31");
        const runObservabilityScenario = requireFunction<
          (scenario: string) => AsyncResult<ExtendedObservabilityResult>
        >(adapter, "runObservabilityScenario");
        const result = await runObservabilityScenario(scenario);

        expect(result.status).not.toBe("completed");
        expect(result.allSpansClosed).toBe(true);
        expect(new Set(result.traceIds).size).toBe(1);
        expect(result.secretExposed).toBe(false);
      },
    );

    it("stores only a bounded summary and artifact reference for large output", async () => {
      const adapter = await loadStepAdapter("31");
      const runObservabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedObservabilityResult>
      >(adapter, "runObservabilityScenario");
      const result = await runObservabilityScenario("large-tool-output");

      expect(result.loggedBytes).toBeLessThanOrEqual(result.logLimitBytes ?? 0);
      expect(result.artifactReference).not.toBe("");
      expect(result.secretExposed).toBe(false);
    });

    it("records parent-child trace links for multiple agents", async () => {
      const adapter = await loadStepAdapter("31");
      const runObservabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ExtendedObservabilityResult>
      >(adapter, "runObservabilityScenario");
      const result = await runObservabilityScenario("multi-agent-trace");

      expect(result.status).toBe("completed");
      expect(result.agentParentLinksValid).toBe(true);
    });
  });
}

interface ExtendedTestingResult {
  status: string;
  externalContracts?: string[];
  failureInjections?: string[];
  regressionTests?: number;
  liveSmokeEnabledByDefault?: boolean;
  leakChecksPassed: boolean;
}

export function registerStep32ExtendedContract(): void {
  describe("step 32 - extended test inventory", () => {
    it("has conformance coverage for every replaceable external boundary", async () => {
      const adapter = await loadStepAdapter("32");
      const inspectTestingArchitecture = requireFunction<() => AsyncResult<ExtendedTestingResult>>(
        adapter,
        "inspectTestingArchitecture",
      );
      const result = await inspectTestingArchitecture();

      expect(result.externalContracts).toEqual(
        expect.arrayContaining([
          "provider",
          "tool",
          "session-repository",
          "execution-backend",
          "server-transport",
          "mcp",
          "plugin",
        ]),
      );
    });

    it("actively injects failures at each long-lived I/O boundary", async () => {
      const adapter = await loadStepAdapter("32");
      const inspectTestingArchitecture = requireFunction<() => AsyncResult<ExtendedTestingResult>>(
        adapter,
        "inspectTestingArchitecture",
      );
      const result = await inspectTestingArchitecture();

      expect(result.failureInjections).toEqual(
        expect.arrayContaining([
          "network-disconnect",
          "rate-limit",
          "provider-midstream",
          "hanging-tool",
          "oversized-output",
          "disk-full",
          "truncated-jsonl",
          "mcp-crash",
          "plugin-hook-error",
          "cancel-during-approval",
        ]),
      );
      expect(result.leakChecksPassed).toBe(true);
    });

    it("keeps live smoke opt-in and retains historical bug regressions", async () => {
      const adapter = await loadStepAdapter("32");
      const inspectTestingArchitecture = requireFunction<() => AsyncResult<ExtendedTestingResult>>(
        adapter,
        "inspectTestingArchitecture",
      );
      const result = await inspectTestingArchitecture();

      expect(result.liveSmokeEnabledByDefault).toBe(false);
      expect(result.regressionTests).toBeGreaterThan(0);
    });
  });
}

interface ExtendedEvalResult {
  status: string;
  taskOutcomeVerified?: boolean;
  diffVerified?: boolean;
  testsVerified?: boolean;
  auditVerified?: boolean;
  budgetExceeded?: boolean;
  regressions: string[];
  judgeFailureAffectedDeterministicAssertions?: boolean;
  secretExposed: boolean;
}

export function registerStep33ExtendedContract(): void {
  describe("step 33 - extended result-based evaluation", () => {
    it("scores files, diffs, tests, events, and audit instead of exact prose", async () => {
      const adapter = await loadStepAdapter("33");
      const runAgentEval = requireFunction<(scenario: string) => AsyncResult<ExtendedEvalResult>>(
        adapter,
        "runAgentEval",
      );
      const result = await runAgentEval("result-based-scoring");

      expect(result.status).toBe("passed");
      expect(result.taskOutcomeVerified).toBe(true);
      expect(result.diffVerified).toBe(true);
      expect(result.testsVerified).toBe(true);
      expect(result.auditVerified).toBe(true);
      expect(result.secretExposed).toBe(false);
    });

    it("fails an eval case that exceeds its time, token, or cost budget", async () => {
      const adapter = await loadStepAdapter("33");
      const runAgentEval = requireFunction<(scenario: string) => AsyncResult<ExtendedEvalResult>>(
        adapter,
        "runAgentEval",
      );
      const result = await runAgentEval("budget-regression");

      expect(result.status).toBe("failed");
      expect(result.budgetExceeded).toBe(true);
      expect(result.regressions).toContain("budget");
    });

    it("keeps deterministic assertions valid when an optional judge fails", async () => {
      const adapter = await loadStepAdapter("33");
      const runAgentEval = requireFunction<(scenario: string) => AsyncResult<ExtendedEvalResult>>(
        adapter,
        "runAgentEval",
      );
      const result = await runAgentEval("judge-failure");

      expect(result.judgeFailureAffectedDeterministicAssertions).toBe(false);
      expect(result.secretExposed).toBe(false);
    });
  });
}
