import { describe, expect, it } from "vitest";

import {
  invoke,
  loadStepAdapter,
  requireFunction,
  withTemporaryDirectory,
} from "../_support/step-test-kit.js";

type AsyncResult<T> = T | Promise<T>;

interface RecoveryScenarioResult {
  status: string;
  modelCalls: number;
  toolCalls: number;
  events?: string[];
  originalBranchIntact?: boolean;
  activePath?: string[];
  replayedEventIds?: string[];
}

export function registerStep18Contract(): void {
  describe("step 18 - recovery, branching, and replay", () => {
    it.each(["model-crash", "tool-crash", "approval-crash"])(
      "records interrupted facts without repeating side effects for %s",
      async (scenario) => {
        const adapter = await loadStepAdapter("18");
        const runRecoveryScenario = requireFunction<
          (scenario: string) => AsyncResult<RecoveryScenarioResult>
        >(adapter, "runRecoveryScenario");
        const result = await runRecoveryScenario(scenario);

        expect(result.status).toBe("recovered");
        expect(result.modelCalls).toBe(0);
        expect(result.toolCalls).toBe(0);
        expect(result.events).toContain(
          scenario === "approval-crash"
            ? "approval.cancelled"
            : scenario === "tool-crash"
              ? "tool.interrupted"
              : "model.interrupted",
        );
      },
    );

    it("branches from an old event without modifying the original branch", async () => {
      const adapter = await loadStepAdapter("18");
      const runRecoveryScenario = requireFunction<
        (scenario: string) => AsyncResult<RecoveryScenarioResult>
      >(adapter, "runRecoveryScenario");
      const result = await runRecoveryScenario("branch");

      expect(result.status).toBe("branched");
      expect(result.originalBranchIntact).toBe(true);
      expect(result.activePath).toEqual(["root", "turn-1", "branch-turn"]);
    });

    it("replay emits recorded events and invokes no external capability", async () => {
      const adapter = await loadStepAdapter("18");
      const runRecoveryScenario = requireFunction<
        (scenario: string) => AsyncResult<RecoveryScenarioResult>
      >(adapter, "runRecoveryScenario");
      const result = await runRecoveryScenario("replay");

      expect(result.status).toBe("replayed");
      expect(result.replayedEventIds).toEqual(["e1", "e2", "e3"]);
      expect(result.modelCalls).toBe(0);
      expect(result.toolCalls).toBe(0);
    });
  });
}

interface ContextScenarioResult {
  status: string;
  includedIds?: string[];
  droppedIds?: string[];
  toolPairsValid?: boolean;
  estimatedTokens?: number;
  budget?: number;
  reportComplete?: boolean;
  providerWireTypesPresent?: boolean;
  fingerprint?: string;
}

export function registerStep19Contract(): void {
  describe("step 19 - deterministic context builder", () => {
    it("always keeps required instructions, current input, and tool pairs", async () => {
      const adapter = await loadStepAdapter("19");
      const buildContextScenario = requireFunction<
        (scenario: string) => AsyncResult<ContextScenarioResult>
      >(adapter, "buildContextScenario");
      const result = await buildContextScenario("budgeted-history");

      expect(result.status).toBe("built");
      expect(result.includedIds).toEqual(
        expect.arrayContaining(["system", "current-user", "tool-call", "tool-result"]),
      );
      expect(result.toolPairsValid).toBe(true);
      expect(result.estimatedTokens).toBeLessThanOrEqual(result.budget ?? 0);
      expect(result.reportComplete).toBe(true);
    });

    it("is deterministic and provider-independent", async () => {
      const adapter = await loadStepAdapter("19");
      const buildContextScenario = requireFunction<
        (scenario: string) => AsyncResult<ContextScenarioResult>
      >(adapter, "buildContextScenario");
      const first = await buildContextScenario("deterministic");
      const second = await buildContextScenario("deterministic");

      expect(first.fingerprint).not.toBe("");
      expect(second.fingerprint).toBe(first.fingerprint);
      expect(first.providerWireTypesPresent).toBe(false);
    });

    it("fails explicitly when required groups exceed the budget", async () => {
      const adapter = await loadStepAdapter("19");
      const buildContextScenario = requireFunction<
        (scenario: string) => AsyncResult<ContextScenarioResult>
      >(adapter, "buildContextScenario");

      await expect(invoke(() => buildContextScenario("required-over-budget"))).rejects.toThrow();
    });
  });
}

interface CompactionScenarioResult {
  status: string;
  originalEventsUnchanged?: boolean;
  summaryValid?: boolean;
  factsDerivedFromEvents?: boolean;
  coveredEventIds?: string[];
  injectedToolInstruction?: boolean;
  compactionEventWritten?: boolean;
}

export function registerStep20Contract(): void {
  describe("step 20 - context compaction", () => {
    it("writes a validated structured summary while preserving original events", async () => {
      const adapter = await loadStepAdapter("20");
      const runCompactionScenario = requireFunction<
        (scenario: string) => AsyncResult<CompactionScenarioResult>
      >(adapter, "runCompactionScenario");
      const result = await runCompactionScenario("long-session");

      expect(result).toMatchObject({
        status: "compacted",
        originalEventsUnchanged: true,
        summaryValid: true,
        factsDerivedFromEvents: true,
        compactionEventWritten: true,
      });
      expect(result.coveredEventIds).toEqual(["e1", "e2", "e3"]);
    });

    it("does not promote instructions embedded in untrusted tool output", async () => {
      const adapter = await loadStepAdapter("20");
      const runCompactionScenario = requireFunction<
        (scenario: string) => AsyncResult<CompactionScenarioResult>
      >(adapter, "runCompactionScenario");
      const result = await runCompactionScenario("prompt-injection");

      expect(result.status).toBe("compacted");
      expect(result.injectedToolInstruction).toBe(false);
    });

    it("keeps the previous context when compaction validation fails", async () => {
      const adapter = await loadStepAdapter("20");
      const runCompactionScenario = requireFunction<
        (scenario: string) => AsyncResult<CompactionScenarioResult>
      >(adapter, "runCompactionScenario");
      const result = await runCompactionScenario("invalid-summary");

      expect(result.status).toBe("failed");
      expect(result.originalEventsUnchanged).toBe(true);
      expect(result.compactionEventWritten).toBe(false);
    });
  });
}

interface ConfigScenarioResult {
  status: string;
  value?: unknown;
  selectedSource?: string;
  sourceHistory?: string[];
  secretSerialized?: boolean;
  projectCodeActivated?: boolean;
  runningSessionChanged?: boolean;
  trust?: string;
}

export function registerStep21Contract(): void {
  describe("step 21 - configuration, credentials, and project trust", () => {
    it("resolves precedence and retains value provenance", async () => {
      const adapter = await loadStepAdapter("21");
      const runConfigScenario = requireFunction<
        (scenario: string) => AsyncResult<ConfigScenarioResult>
      >(adapter, "runConfigScenario");
      const result = await runConfigScenario("precedence");

      expect(result.status).toBe("resolved");
      expect(result.value).toBe("managed-value");
      expect(result.selectedSource).toBe("managed");
      expect(result.sourceHistory).toEqual([
        "default",
        "user",
        "project",
        "explicit",
        "env",
        "cli",
        "managed",
      ]);
    });

    it("never serializes credentials or activates untrusted project code", async () => {
      const adapter = await loadStepAdapter("21");
      const runConfigScenario = requireFunction<
        (scenario: string) => AsyncResult<ConfigScenarioResult>
      >(adapter, "runConfigScenario");
      const secret = await runConfigScenario("secret-redaction");
      const untrusted = await runConfigScenario("untrusted-project");

      expect(secret.secretSerialized).toBe(false);
      expect(untrusted.trust).toBe("untrusted");
      expect(untrusted.projectCodeActivated).toBe(false);
    });

    it("keeps an immutable config snapshot for a running session", async () => {
      const adapter = await loadStepAdapter("21");
      const runConfigScenario = requireFunction<
        (scenario: string) => AsyncResult<ConfigScenarioResult>
      >(adapter, "runConfigScenario");
      const result = await runConfigScenario("reload-during-session");

      expect(result.runningSessionChanged).toBe(false);
    });
  });
}

interface ProviderConformanceResult {
  providers: Array<{
    id: string;
    protocol: string;
    passedScenarios: string[];
    secretsExposed: boolean;
  }>;
  agentLoopProviderBranches: number;
  canonicalSnapshotsEqual: boolean;
}

export function registerStep22Contract(): void {
  describe("step 22 - second provider conformance", () => {
    it("runs the same offline conformance suite against two different protocols", async () => {
      const adapter = await loadStepAdapter("22");
      const runProviderConformance = requireFunction<() => AsyncResult<ProviderConformanceResult>>(
        adapter,
        "runProviderConformance",
      );
      const result = await runProviderConformance();
      const requiredScenarios = [
        "text",
        "tool-call-fragments",
        "abort",
        "timeout",
        "authentication-error",
        "rate-limit",
        "malformed-stream",
        "unsupported-capability",
      ];

      expect(result.providers.length).toBeGreaterThanOrEqual(2);
      expect(new Set(result.providers.map((provider) => provider.protocol)).size).toBeGreaterThan(
        1,
      );
      for (const provider of result.providers) {
        expect(provider.passedScenarios).toEqual(expect.arrayContaining(requiredScenarios));
        expect(provider.secretsExposed).toBe(false);
      }
      expect(result.canonicalSnapshotsEqual).toBe(true);
    });

    it("does not add provider-name branches to the agent loop", async () => {
      const adapter = await loadStepAdapter("22");
      const runProviderConformance = requireFunction<() => AsyncResult<ProviderConformanceResult>>(
        adapter,
        "runProviderConformance",
      );
      const result = await runProviderConformance();

      expect(result.agentLoopProviderBranches).toBe(0);
    });
  });
}

interface SkillScenarioResult {
  status: string;
  winner?: string;
  shadowed?: string[];
  bodyReadsDuringDiscovery?: number;
  loadedHash?: string;
  sourceRecorded?: boolean;
  projectSkillLoaded?: boolean;
  toolPermissionEscalated?: boolean;
}

export function registerStep23Contract(): void {
  describe("step 23 - instructions and skills", () => {
    it("discovers metadata lazily and resolves duplicates deterministically", async () => {
      await withTemporaryDirectory("agent-skills", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("23");
        const runSkillScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<SkillScenarioResult>
        >(adapter, "runSkillScenario");
        const result = await runSkillScenario(workspaceRoot, "lazy-discovery-and-shadowing");

        expect(result.status).toBe("discovered");
        expect(result.bodyReadsDuringDiscovery).toBe(0);
        expect(result.winner).toBe("managed/example");
        expect(result.shadowed).toContain("project/example");
      });
    });

    it("records the loaded skill source and content hash", async () => {
      await withTemporaryDirectory("agent-skills", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("23");
        const runSkillScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<SkillScenarioResult>
        >(adapter, "runSkillScenario");
        const result = await runSkillScenario(workspaceRoot, "explicit-load");

        expect(result.status).toBe("loaded");
        expect(result.loadedHash).toMatch(/^[a-f0-9]{32,}$/i);
        expect(result.sourceRecorded).toBe(true);
      });
    });

    it("blocks path escape, archive escape, and untrusted project skills", async () => {
      await withTemporaryDirectory("agent-skills", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("23");
        const runSkillScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<SkillScenarioResult>
        >(adapter, "runSkillScenario");

        for (const scenario of ["reference-escape", "archive-escape"]) {
          await expect(invoke(() => runSkillScenario(workspaceRoot, scenario))).rejects.toThrow();
        }
        const untrusted = await runSkillScenario(workspaceRoot, "untrusted-project-skill");
        expect(untrusted.projectSkillLoaded).toBe(false);
      });
    });

    it("does not let skill text elevate tool permissions", async () => {
      await withTemporaryDirectory("agent-skills", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("23");
        const runSkillScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<SkillScenarioResult>
        >(adapter, "runSkillScenario");
        const result = await runSkillScenario(workspaceRoot, "malicious-permission-instruction");

        expect(result.toolPermissionEscalated).toBe(false);
      });
    });
  });
}
