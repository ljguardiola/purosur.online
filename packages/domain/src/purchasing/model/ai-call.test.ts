import { describe, expect, it } from "vitest";
import { AI_CALL_OUTCOMES, AI_CALL_PURPOSES } from "./ai-call.js";

describe("AI calls", () => {
  it("are made to read a price list or to propose a link for one of its items", () => {
    expect(AI_CALL_PURPOSES).toEqual(["READING", "LINK_PROPOSAL"]);
  });

  it("end completed, cut short or failed", () => {
    expect(AI_CALL_OUTCOMES).toEqual(["completed", "cut_short", "failed"]);
  });
});
