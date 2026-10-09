import { describe, expect, it } from "vitest";
import { SALES_DENIED_REASONS } from "./sales-denied.js";

describe("SALES_DENIED_REASONS", () => {
  it("lists the reasons a register reports for not selling: only a broken event history", () => {
    expect(SALES_DENIED_REASONS).toEqual(["event_history_broken"]);
  });
});
