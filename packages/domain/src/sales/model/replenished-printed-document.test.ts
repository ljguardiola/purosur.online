import { describe, expect, it } from "vitest";
import { replenishedPrintAttempt } from "./replenished-printed-document.js";

const COMPLETED_AT = new Date("2026-10-07T10:00:00.000Z");

describe("replenishedPrintAttempt", () => {
  it("counts the original of a replenished sale the register knows no attempt of as attempted when the sale completed", () => {
    expect(replenishedPrintAttempt(COMPLETED_AT, null)).toEqual(COMPLETED_AT);
  });

  it("records nothing over an attempt the register already knows", () => {
    expect(replenishedPrintAttempt(COMPLETED_AT, new Date("2026-10-07T10:05:00.000Z"))).toBeNull();
  });
});
