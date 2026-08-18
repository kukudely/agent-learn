import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

interface DocumentedContract {
  readonly step: string;
  readonly document: string;
  readonly contractFile: string;
  readonly exports: readonly string[];
  readonly scenarios?: readonly string[];
}

const CONTRACTS: readonly DocumentedContract[] = [
  {
    step: "02",
    document: "02-message-and-content-protocol.md",
    contractFile: "steps-00-11.ts",
    exports: ["createMessageExamples", "roundTripMessage", "extractToolLink", "parseMessage"],
  },
  {
    step: "03",
    document: "03-async-event-stream.md",
    contractFile: "steps-00-11.ts",
    exports: ["createEventStream"],
  },
  {
    step: "04",
    document: "04-scripted-model.md",
    contractFile: "steps-00-11.ts",
    exports: ["runScriptedModel", "runFragmentedToolCall", "runAbortScenario"],
  },
  {
    step: "05",
    document: "05-model-client-and-real-provider.md",
    contractFile: "steps-00-11.ts",
    exports: ["runProviderScenario"],
    scenarios: ["text", "fragmented-tool-call", "unauthorized", "rate-limit"],
  },
  {
    step: "06",
    document: "06-single-turn-agent.md",
    contractFile: "steps-00-11.ts",
    exports: ["runSingleTurnScenario"],
    scenarios: ["text", "length", "provider-error", "abort"],
  },
  {
    step: "07",
    document: "07-tool-contract-and-registry.md",
    contractFile: "steps-00-11.ts",
    exports: ["runToolRegistryScenario"],
    scenarios: [
      "success",
      "invalid-arguments",
      "unknown-tool",
      "tool-error",
      "duplicate-registration",
    ],
  },
  {
    step: "08",
    document: "08-sequential-tool-agent-loop.md",
    contractFile: "steps-00-11.ts",
    exports: ["runAgentLoopScenario"],
    scenarios: ["single-tool", "multiple-tools", "invalid-tool-arguments", "max-steps"],
  },
  {
    step: "09",
    document: "09-stateful-agent-session.md",
    contractFile: "steps-00-11.ts",
    exports: ["runAgentSessionScenario"],
    scenarios: ["concurrent-prompt", "interrupt", "subscriber-error"],
  },
  {
    step: "10",
    document: "10-workspace-and-path-security.md",
    contractFile: "steps-00-11.ts",
    exports: ["createWorkspace"],
  },
  {
    step: "11",
    document: "11-read-only-file-tools.md",
    contractFile: "steps-00-11.ts",
    exports: ["createReadonlyTools"],
  },
  {
    step: "12",
    document: "12-controlled-writes-and-patches.md",
    contractFile: "steps-12-17.ts",
    exports: ["runPatchScenario"],
    scenarios: [
      "create",
      "compare-and-swap-update",
      "stale-precondition",
      "path-traversal",
      "symlink-escape",
    ],
  },
  {
    step: "13",
    document: "13-shell-executor.md",
    contractFile: "steps-12-17.ts",
    exports: ["runShellScenario"],
    scenarios: ["structured-arguments", "non-zero", "timeout", "abort"],
  },
  {
    step: "14",
    document: "14-permissions-and-approvals.md",
    contractFile: "steps-12-17.ts",
    exports: ["runPolicyScenario"],
    scenarios: [
      "explicit-allow",
      "explicit-deny",
      "ask-approved",
      "ask-denied",
      "conflicting-rules",
      "approve-once",
      "approve-session",
    ],
  },
  {
    step: "15",
    document: "15-cancellation-budgets-and-retries.md",
    contractFile: "steps-12-17.ts",
    exports: ["runReliabilityScenario"],
    scenarios: [
      "max-steps",
      "rate-limit-then-success",
      "bad-request",
      "side-effect-unknown",
      "abort-during-backoff",
    ],
  },
  {
    step: "16",
    document: "16-safe-tool-parallelism.md",
    contractFile: "steps-12-17.ts",
    exports: ["runToolBatchScenario"],
    scenarios: ["reverse-completion", "write-conflict", "ordinary-error", "cancel"],
  },
  {
    step: "17",
    document: "17-append-only-session-protocol.md",
    contractFile: "steps-12-17.ts",
    exports: ["runSessionProtocolScenario"],
    scenarios: [
      "append-load-reopen",
      "expected-sequence-conflict",
      "truncated-tail",
      "corrupt-complete-line",
      "redaction-and-unknown-event",
    ],
  },
  {
    step: "18",
    document: "18-recovery-branching-and-replay.md",
    contractFile: "steps-18-23.ts",
    exports: ["runRecoveryScenario"],
    scenarios: ["model-crash", "tool-crash", "approval-crash", "branch", "replay"],
  },
  {
    step: "19",
    document: "19-context-builder.md",
    contractFile: "steps-18-23.ts",
    exports: ["buildContextScenario"],
    scenarios: ["budgeted-history", "deterministic", "required-over-budget"],
  },
  {
    step: "20",
    document: "20-context-compaction.md",
    contractFile: "steps-18-23.ts",
    exports: ["runCompactionScenario"],
    scenarios: ["long-session", "prompt-injection", "invalid-summary"],
  },
  {
    step: "21",
    document: "21-configuration-credentials-and-project-trust.md",
    contractFile: "steps-18-23.ts",
    exports: ["runConfigScenario"],
    scenarios: ["precedence", "secret-redaction", "untrusted-project", "reload-during-session"],
  },
  {
    step: "22",
    document: "22-second-provider-conformance.md",
    contractFile: "steps-18-23.ts",
    exports: ["runProviderConformance"],
    scenarios: [
      "text",
      "tool-call-fragments",
      "abort",
      "timeout",
      "authentication-error",
      "rate-limit",
      "malformed-stream",
      "unsupported-capability",
    ],
  },
  {
    step: "23",
    document: "23-instructions-and-skills.md",
    contractFile: "steps-18-23.ts",
    exports: ["runSkillScenario"],
    scenarios: [
      "lazy-discovery-and-shadowing",
      "explicit-load",
      "reference-escape",
      "archive-escape",
      "untrusted-project-skill",
      "malicious-permission-instruction",
    ],
  },
  {
    step: "24",
    document: "24-mcp-client.md",
    contractFile: "steps-24-29.ts",
    exports: ["runMcpScenario"],
    scenarios: ["initialize-list-call", "cancel-call", "protocol-error", "server-disconnect"],
  },
  {
    step: "25",
    document: "25-plugin-extension-system.md",
    contractFile: "steps-24-29.ts",
    exports: ["runPluginScenario"],
    scenarios: ["discover-and-activate", "invalid-and-duplicate", "untrusted-project", "unload"],
  },
  {
    step: "26",
    document: "26-user-input-steering-plan-todo.md",
    contractFile: "steps-24-29.ts",
    exports: ["runInteractionScenario"],
    scenarios: ["steer-during-tool", "plan-and-todos", "stale-plan-update"],
  },
  {
    step: "27",
    document: "27-minimal-multi-agent.md",
    contractFile: "steps-24-29.ts",
    exports: ["runMultiAgentScenario"],
    scenarios: ["spawn-and-join", "message-routing", "limits", "cycle", "parent-cancel"],
  },
  {
    step: "28",
    document: "28-headless-server-protocol.md",
    contractFile: "steps-24-29.ts",
    exports: ["runServerScenario"],
    scenarios: [
      "connect-command-resume",
      "duplicate-command",
      "slow-client",
      "disconnect",
      "unauthenticated",
      "incompatible-version",
    ],
  },
  {
    step: "29",
    document: "29-thin-clients.md",
    contractFile: "steps-24-29.ts",
    exports: ["runClientScenario"],
    scenarios: ["shared-transcript", "architecture-boundary", "user-actions"],
  },
  {
    step: "30",
    document: "30-sandbox-backends.md",
    contractFile: "steps-30-34.ts",
    exports: ["runSandboxConformance"],
    scenarios: [
      "stdout-stderr",
      "non-zero-exit",
      "working-directory",
      "environment-filtering",
      "timeout",
      "abort",
      "output-limit",
      "filesystem-policy",
    ],
  },
  {
    step: "31",
    document: "31-trace-logging-cost-audit.md",
    contractFile: "steps-30-34.ts",
    exports: ["runObservabilityScenario"],
    scenarios: ["successful-run", "secret-redaction", "log-sink-failure"],
  },
  {
    step: "32",
    document: "32-layered-testing.md",
    contractFile: "steps-30-34.ts",
    exports: ["inspectTestingArchitecture"],
  },
  {
    step: "33",
    document: "33-agent-eval.md",
    contractFile: "steps-30-34.ts",
    exports: ["runAgentEval"],
    scenarios: ["baseline", "safety-regression"],
  },
  {
    step: "34",
    document: "34-capstone-acceptance.md",
    contractFile: "steps-30-34.ts",
    exports: ["runCapstoneAcceptance"],
    scenarios: [
      "plain-conversation",
      "read-and-answer",
      "patch-with-approval",
      "shell-denied",
      "cancel-mid-run",
      "provider-retry",
      "session-restart",
      "branch-and-replay",
      "context-compaction",
      "mcp-tool",
      "plugin-and-skill",
      "multi-agent",
      "headless-client",
      "sandbox-violation",
      "audit-and-cost",
    ],
  },
];

const PROJECT_ROOT = new URL("../../", import.meta.url);

describe("step contract documentation", () => {
  it("documents every adapter export used by a step contract", async () => {
    expect(CONTRACTS).toHaveLength(33);

    for (const contract of CONTRACTS) {
      const document = await readFile(
        new URL(`docs/steps/${contract.document}`, PROJECT_ROOT),
        "utf8",
      );
      const testSource = await readFile(
        new URL(`test/steps/_contracts/${contract.contractFile}`, PROJECT_ROOT),
        "utf8",
      );

      for (const exportName of contract.exports) {
        expect(document, `step ${contract.step} document must mention ${exportName}`).toContain(
          exportName,
        );
        expect(testSource, `step ${contract.step} contract must use ${exportName}`).toContain(
          exportName,
        );
      }
    }
  });

  it("keeps documented scenario names aligned with executable contracts", async () => {
    for (const contract of CONTRACTS) {
      const document = await readFile(
        new URL(`docs/steps/${contract.document}`, PROJECT_ROOT),
        "utf8",
      );
      const testSource = await readFile(
        new URL(`test/steps/_contracts/${contract.contractFile}`, PROJECT_ROOT),
        "utf8",
      );

      for (const scenario of contract.scenarios ?? []) {
        expect(
          document,
          `step ${contract.step} document must mention scenario ${scenario}`,
        ).toContain(scenario);
        expect(
          testSource,
          `step ${contract.step} test must execute or require ${scenario}`,
        ).toContain(scenario);
      }
    }
  });
});
