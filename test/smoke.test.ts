import { describe, expect, it } from "vitest";

import { INITIALIZATION_MESSAGE, PROJECT_NAME } from "../src/index.js";

describe("project bootstrap", () => {
  it("exposes the initialized project metadata", () => {
    expect(PROJECT_NAME).toBe("agent-learn");
    expect(INITIALIZATION_MESSAGE).toContain("docs/AGENT_LEARNING_PLAN.md");
  });
});
