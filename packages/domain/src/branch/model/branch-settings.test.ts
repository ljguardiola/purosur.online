import { describe, expect, it } from "vitest";
import { BRANCH_SETTINGS_DAYS_MAX, BRANCH_SETTINGS_TEXT_MAX_LENGTH } from "./branch-settings.js";

describe("BRANCH_SETTINGS_DAYS_MAX", () => {
  it("is the Postgres integer column's ceiling", () => {
    expect(BRANCH_SETTINGS_DAYS_MAX).toBe(2_147_483_647);
  });
});

describe("BRANCH_SETTINGS_TEXT_MAX_LENGTH", () => {
  it("caps the address, whatsapp number and instagram handle at 200 characters", () => {
    expect(BRANCH_SETTINGS_TEXT_MAX_LENGTH).toBe(200);
  });
});
