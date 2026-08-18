export const FIRST_LEARNING_STEP = 0;
export const LAST_LEARNING_STEP = 34;

const STEP_ID_WIDTH = 2;

export function formatStepId(step: number): string {
  assertStepInRange(step);
  return step.toString().padStart(STEP_ID_WIDTH, "0");
}

export function parseStepId(rawStep: string | undefined): number {
  if (rawStep === undefined || !/^\d{1,2}$/.test(rawStep)) {
    throw new Error(
      `Expected a step number from ${formatStepRange()}, for example: npm run verify:step -- 08`,
    );
  }

  const step = Number.parseInt(rawStep, 10);
  assertStepInRange(step);
  return step;
}

export function selectStepIds(targetStep: number, onlyTarget: boolean): number[] {
  assertStepInRange(targetStep);

  if (onlyTarget) {
    return [targetStep];
  }

  return Array.from(
    { length: targetStep - FIRST_LEARNING_STEP + 1 },
    (_, index) => FIRST_LEARNING_STEP + index,
  );
}

export function formatStepRange(): string {
  return `${formatUnchecked(FIRST_LEARNING_STEP)}-${formatUnchecked(LAST_LEARNING_STEP)}`;
}

function assertStepInRange(step: number): void {
  if (!Number.isInteger(step) || step < FIRST_LEARNING_STEP || step > LAST_LEARNING_STEP) {
    throw new Error(`Step must be an integer in range ${formatStepRange()}; received ${step}.`);
  }
}

function formatUnchecked(step: number): string {
  return step.toString().padStart(STEP_ID_WIDTH, "0");
}
