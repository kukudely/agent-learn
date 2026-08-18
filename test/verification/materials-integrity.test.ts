import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { formatStepId } from "../../src/verification/step-selection.js";

const PROJECT_ROOT = new URL("../../", import.meta.url);

const STEP_DOCUMENTS = [
  "00-scope-and-invariants.md",
  "01-project-skeleton-and-quality-baseline.md",
  "02-message-and-content-protocol.md",
  "03-async-event-stream.md",
  "04-scripted-model.md",
  "05-model-client-and-real-provider.md",
  "06-single-turn-agent.md",
  "07-tool-contract-and-registry.md",
  "08-sequential-tool-agent-loop.md",
  "09-stateful-agent-session.md",
  "10-workspace-and-path-security.md",
  "11-read-only-file-tools.md",
  "12-controlled-writes-and-patches.md",
  "13-shell-executor.md",
  "14-permissions-and-approvals.md",
  "15-cancellation-budgets-and-retries.md",
  "16-safe-tool-parallelism.md",
  "17-append-only-session-protocol.md",
  "18-recovery-branching-and-replay.md",
  "19-context-builder.md",
  "20-context-compaction.md",
  "21-configuration-credentials-and-project-trust.md",
  "22-second-provider-conformance.md",
  "23-instructions-and-skills.md",
  "24-mcp-client.md",
  "25-plugin-extension-system.md",
  "26-user-input-steering-plan-todo.md",
  "27-minimal-multi-agent.md",
  "28-headless-server-protocol.md",
  "29-thin-clients.md",
  "30-sandbox-backends.md",
  "31-trace-logging-cost-audit.md",
  "32-layered-testing.md",
  "33-agent-eval.md",
  "34-capstone-acceptance.md",
] as const;

describe("learning materials integrity", () => {
  it("keeps exactly one expanded document for every planned step", () => {
    expect(STEP_DOCUMENTS).toHaveLength(35);
    expect(new Set(STEP_DOCUMENTS).size).toBe(35);

    for (const document of STEP_DOCUMENTS) {
      expect(
        existsSync(new URL(`docs/steps/${document}`, PROJECT_ROOT)),
        `missing docs/steps/${document}`,
      ).toBe(true);
    }
  });

  it("keeps every document executable and self-checking", async () => {
    for (const [step, document] of STEP_DOCUMENTS.entries()) {
      const id = formatStepId(step);
      const content = await readFile(new URL(`docs/steps/${document}`, PROJECT_ROOT), "utf8");

      expect(content, `${document} must identify step ${id}`).toMatch(new RegExp(`步骤 ${id}`));
      expect(content, `${document} must describe implementation work`).toContain("## 实现步骤");
      expect(content, `${document} must provide a test matrix`).toMatch(/## 测试(矩阵|契约)/);
      expect(content, `${document} must provide exit criteria`).toMatch(/## (最终)?退出清单/);
      expect(content, `${document} must show its verification command`).toContain(
        `npm run verify:step -- ${id}`,
      );

      if (step >= 2) {
        expect(content, `${document} must define its adapter`).toContain(`step-${id}.adapter.ts`);
      }
    }
  });

  it("keeps one executable acceptance contract for every step", () => {
    for (let step = 0; step <= 34; step += 1) {
      const id = formatStepId(step);
      expect(
        existsSync(new URL(`test/steps/step-${id}.test.ts`, PROJECT_ROOT)),
        `missing test/steps/step-${id}.test.ts`,
      ).toBe(true);
    }
  });
});
