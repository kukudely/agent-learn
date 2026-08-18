#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { formatStepId, parseStepId, selectStepIds } from "./step-selection.js";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VITEST_ENTRY = fileURLToPath(
  new URL("../../node_modules/vitest/vitest.mjs", import.meta.url),
);
const STEP_CONFIG = fileURLToPath(new URL("../../vitest.steps.config.ts", import.meta.url));
const ONLY_FLAG = "--only";

async function main(): Promise<void> {
  const rawStep = process.argv[2];
  const onlyTarget = process.argv.includes(ONLY_FLAG);
  const targetStep = parseStepId(rawStep);
  const selectedSteps = selectStepIds(targetStep, onlyTarget);
  const stepFiles = selectedSteps.map(stepTestPath);

  for (const stepFile of stepFiles) {
    if (!existsSync(stepFile)) {
      throw new Error(`Missing step contract: ${stepFile}`);
    }
  }

  await runNpm(["run", "typecheck"]);
  await runNpm(["run", "lint"]);
  await runNpm(["test"]);
  await runCommand(process.execPath, [VITEST_ENTRY, "run", "--config", STEP_CONFIG, ...stepFiles]);
}

function stepTestPath(step: number): string {
  return fileURLToPath(
    new URL(`../../test/steps/step-${formatStepId(step)}.test.ts`, import.meta.url),
  );
}

async function runNpm(args: readonly string[]): Promise<void> {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath === undefined || npmExecPath.length === 0) {
    throw new Error(
      "npm_execpath is unavailable. Run this verifier through `npm run verify:step -- XX`.",
    );
  }

  await runCommand(process.execPath, [npmExecPath, ...args]);
}

async function runCommand(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      shell: false,
    });

    child.once("error", reject);
    child.once("exit", (exitCode, signal) => {
      if (signal !== null) {
        reject(new Error(`${command} was terminated by signal ${signal}.`));
        return;
      }

      if (exitCode !== 0) {
        reject(new Error(`${command} exited with code ${exitCode ?? "unknown"}.`));
        return;
      }

      resolve();
    });
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Step verification failed: ${message}\n`);
  process.exitCode = 1;
});
