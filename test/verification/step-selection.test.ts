import { describe, expect, it } from "vitest";

import {
  FIRST_LEARNING_STEP,
  formatStepId,
  LAST_LEARNING_STEP,
  parseStepId,
  selectStepIds,
} from "../../src/verification/step-selection.js";

describe("step selection", () => {
  it("formats step identifiers with two digits", () => {
    expect(formatStepId(FIRST_LEARNING_STEP)).toBe("00");
    expect(formatStepId(LAST_LEARNING_STEP)).toBe("34");
  });

  it("parses valid step identifiers", () => {
    expect(parseStepId("0")).toBe(0);
    expect(parseStepId("08")).toBe(8);
    expect(parseStepId("34")).toBe(34);
  });

  it.each([undefined, "", "-1", "35", "abc", "1.5"])(
    "rejects invalid step identifier %s",
    (rawStep) => {
      expect(() => parseStepId(rawStep)).toThrow();
    },
  );

  it("selects all prerequisite steps by default", () => {
    expect(selectStepIds(3, false)).toEqual([0, 1, 2, 3]);
  });

  it("can select only the target step for focused debugging", () => {
    expect(selectStepIds(3, true)).toEqual([3]);
  });
});
