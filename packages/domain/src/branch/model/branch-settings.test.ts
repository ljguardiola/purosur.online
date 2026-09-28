import { describe, expect, it } from "vitest";
import { BRANCH_SETTINGS_DAYS_MAX } from "./branch-settings.js";

describe("BRANCH_SETTINGS_DAYS_MAX", () => {
  it("is the Postgres integer column's ceiling", () => {
    expect(BRANCH_SETTINGS_DAYS_MAX).toBe(2_147_483_647);
  });
});
