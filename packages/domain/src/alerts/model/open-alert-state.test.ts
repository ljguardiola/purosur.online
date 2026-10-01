import { describe, expect, it } from "vitest";
import { isOpenAlert } from "./open-alert-state.js";

describe("isOpenAlert", () => {
  it("is open until it is resolved", () => {
    expect(isOpenAlert({ resolvedAt: null })).toBe(true);
    expect(isOpenAlert({ resolvedAt: new Date("2026-10-01T12:00:00.000Z") })).toBe(false);
  });
});
