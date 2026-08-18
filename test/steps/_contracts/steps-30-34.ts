import { describe, expect, it } from "vitest";

import { loadStepAdapter, requireFunction } from "../_support/step-test-kit.js";

type AsyncResult<T> = T | Promise<T>;

interface SandboxScenarioResult {
  backends: Array<{
    name: string;
    passedScenarios: string[];
    capabilities: string[];
  }>;
  hostEscapeSucceeded: boolean;
  policyBypassSucceeded: boolean;
  activeProcessesAfter: number;
}

export function registerStep30Contract(): void {
  describe("step 30 - replaceable sandbox backends", () => {
    it("passes one backend-independent execution conformance suite", async () => {
      const adapter = await loadStepAdapter("30");
      const runSandboxConformance = requireFunction<() => AsyncResult<SandboxScenarioResult>>(
        adapter,
        "runSandboxConformance",
      );
      const result = await runSandboxConformance();
      const requiredScenarios = [
        "stdout-stderr",
        "non-zero-exit",
        "working-directory",
        "environment-filtering",
        "timeout",
        "abort",
        "output-limit",
        "filesystem-policy",
      ];

      expect(result.backends.length).toBeGreaterThanOrEqual(2);
      for (const backend of result.backends) {
        expect(backend.passedScenarios).toEqual(expect.arrayContaining(requiredScenarios));
        expect(backend.capabilities.length).toBeGreaterThan(0);
      }
    });

    it("does not let a backend bypass policy or escape the host boundary", async () => {
      const adapter = await loadStepAdapter("30");
      const runSandboxConformance = requireFunction<() => AsyncResult<SandboxScenarioResult>>(
        adapter,
        "runSandboxConformance",
      );
      const result = await runSandboxConformance();

      expect(result.policyBypassSucceeded).toBe(false);
      expect(result.hostEscapeSucceeded).toBe(false);
      expect(result.activeProcessesAfter).toBe(0);
    });
  });
}

interface ObservabilityScenarioResult {
  status: string;
  traceIds?: string[];
  spanParentsValid?: boolean;
  tokenTotals?: { input: number; output: number };
  costTotal?: number;
  auditSequence?: number[];
  secretExposed?: boolean;
  businessResultChangedByLogFailure?: boolean;
}

export function registerStep31Contract(): void {
  describe("step 31 - traces, logs, cost, and audit", () => {
    it("correlates model, tool, policy, and session spans", async () => {
      const adapter = await loadStepAdapter("31");
      const runObservabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ObservabilityScenarioResult>
      >(adapter, "runObservabilityScenario");
      const result = await runObservabilityScenario("successful-run");

      expect(result.status).toBe("completed");
      expect(new Set(result.traceIds).size).toBe(1);
      expect(result.spanParentsValid).toBe(true);
      expect(result.tokenTotals).toEqual({ input: 120, output: 30 });
      expect(result.costTotal).toBeGreaterThan(0);
      expect(result.auditSequence).toEqual([1, 2, 3, 4]);
    });

    it("redacts secrets from logs, traces, errors, and audit records", async () => {
      const adapter = await loadStepAdapter("31");
      const runObservabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ObservabilityScenarioResult>
      >(adapter, "runObservabilityScenario");
      const result = await runObservabilityScenario("secret-redaction");

      expect(result.secretExposed).toBe(false);
    });

    it("keeps best-effort telemetry failure separate from the business result", async () => {
      const adapter = await loadStepAdapter("31");
      const runObservabilityScenario = requireFunction<
        (scenario: string) => AsyncResult<ObservabilityScenarioResult>
      >(adapter, "runObservabilityScenario");
      const result = await runObservabilityScenario("log-sink-failure");

      expect(result.status).toBe("completed");
      expect(result.businessResultChangedByLogFailure).toBe(false);
    });
  });
}

interface TestingArchitectureResult {
  status: string;
  layers: Record<string, number>;
  realNetworkCalls: number;
  flakyTimerTests: number;
  sharedMutableFixtures: number;
  raceChecksPassed: boolean;
  leakChecksPassed: boolean;
  mutationSurvivorsInCriticalModules: number;
}

export function registerStep32Contract(): void {
  describe("step 32 - layered testing architecture", () => {
    it("contains meaningful tests at every required layer", async () => {
      const adapter = await loadStepAdapter("32");
      const inspectTestingArchitecture = requireFunction<
        () => AsyncResult<TestingArchitectureResult>
      >(adapter, "inspectTestingArchitecture");
      const result = await inspectTestingArchitecture();

      expect(result.status).toBe("healthy");
      for (const layer of [
        "unit",
        "contract",
        "integration",
        "failure",
        "security",
        "end_to_end",
      ]) {
        expect(result.layers[layer], `missing ${layer} tests`).toBeGreaterThan(0);
      }
    });

    it("keeps deterministic tests isolated from network, time, and shared state", async () => {
      const adapter = await loadStepAdapter("32");
      const inspectTestingArchitecture = requireFunction<
        () => AsyncResult<TestingArchitectureResult>
      >(adapter, "inspectTestingArchitecture");
      const result = await inspectTestingArchitecture();

      expect(result.realNetworkCalls).toBe(0);
      expect(result.flakyTimerTests).toBe(0);
      expect(result.sharedMutableFixtures).toBe(0);
      expect(result.raceChecksPassed).toBe(true);
      expect(result.leakChecksPassed).toBe(true);
    });

    it("uses mutation checks to prove critical assertions are effective", async () => {
      const adapter = await loadStepAdapter("32");
      const inspectTestingArchitecture = requireFunction<
        () => AsyncResult<TestingArchitectureResult>
      >(adapter, "inspectTestingArchitecture");
      const result = await inspectTestingArchitecture();

      expect(result.mutationSurvivorsInCriticalModules).toBe(0);
    });
  });
}

interface EvalScenarioResult {
  status: string;
  datasetVersion: string;
  repeatScores: number[];
  aggregateScore: number;
  categoryScores: Record<string, number>;
  regressions: string[];
  artifactsWritten: boolean;
  secretExposed: boolean;
}

export function registerStep33Contract(): void {
  describe("step 33 - agent evaluation", () => {
    it("scores a versioned offline dataset reproducibly", async () => {
      const adapter = await loadStepAdapter("33");
      const runAgentEval = requireFunction<(scenario: string) => AsyncResult<EvalScenarioResult>>(
        adapter,
        "runAgentEval",
      );
      const result = await runAgentEval("baseline");

      expect(result.status).toBe("passed");
      expect(result.datasetVersion).toMatch(/^v\d+/);
      expect(result.repeatScores.length).toBeGreaterThanOrEqual(3);
      expect(new Set(result.repeatScores).size).toBe(1);
      expect(result.aggregateScore).toBeGreaterThanOrEqual(0.8);
      expect(Object.keys(result.categoryScores)).toEqual(
        expect.arrayContaining(["tool_use", "safety", "recovery", "instruction_following"]),
      );
      expect(result.artifactsWritten).toBe(true);
      expect(result.secretExposed).toBe(false);
    });

    it("identifies category regressions instead of hiding them in an average", async () => {
      const adapter = await loadStepAdapter("33");
      const runAgentEval = requireFunction<(scenario: string) => AsyncResult<EvalScenarioResult>>(
        adapter,
        "runAgentEval",
      );
      const result = await runAgentEval("safety-regression");

      expect(result.status).toBe("failed");
      expect(result.regressions).toContain("safety");
    });
  });
}

interface CapstoneAcceptanceResult {
  status: string;
  passedScenarios: string[];
  failedScenarios: string[];
  invariantViolations: string[];
  unhandledRejections: number;
  leakedResources: number;
  secretsExposed: boolean;
  replayDeterministic: boolean;
}

export function registerStep34Contract(): void {
  describe("step 34 - capstone acceptance", () => {
    it("passes the complete product-level acceptance matrix", async () => {
      const adapter = await loadStepAdapter("34");
      const runCapstoneAcceptance = requireFunction<() => AsyncResult<CapstoneAcceptanceResult>>(
        adapter,
        "runCapstoneAcceptance",
      );
      const result = await runCapstoneAcceptance();
      const requiredScenarios = [
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
      ];

      expect(result.status).toBe("passed");
      expect(result.passedScenarios).toEqual(expect.arrayContaining(requiredScenarios));
      expect(result.failedScenarios).toEqual([]);
      expect(result.invariantViolations).toEqual([]);
    });

    it("finishes without leaks, secret exposure, or nondeterministic replay", async () => {
      const adapter = await loadStepAdapter("34");
      const runCapstoneAcceptance = requireFunction<() => AsyncResult<CapstoneAcceptanceResult>>(
        adapter,
        "runCapstoneAcceptance",
      );
      const result = await runCapstoneAcceptance();

      expect(result.unhandledRejections).toBe(0);
      expect(result.leakedResources).toBe(0);
      expect(result.secretsExposed).toBe(false);
      expect(result.replayDeterministic).toBe(true);
    });
  });
}
