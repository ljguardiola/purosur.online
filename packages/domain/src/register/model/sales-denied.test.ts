import { describe, expect, it } from "vitest";
import { SALES_DENIED_REASONS, STORAGE_SALES_DENIED_REASONS } from "./sales-denied.js";

describe("SALES_DENIED_REASONS", () => {
  it("lists the reasons a register reports for not selling: a broken event history, a damaged local database or a critically low battery", () => {
    expect(SALES_DENIED_REASONS).toEqual([
      "event_history_broken",
      "local_database_damaged",
      "battery_critical",
      "disk_space_short_at_startup",
      "disk_full",
    ]);
  });
});

describe("STORAGE_SALES_DENIED_REASONS", () => {
  it("lists the reasons a register denies sales for lack of disk space: short at startup or full", () => {
    expect(STORAGE_SALES_DENIED_REASONS).toEqual(["disk_space_short_at_startup", "disk_full"]);
  });
});
