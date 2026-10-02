import { describe, expect, it } from "vitest";
import { isCoreReadyMessage } from "./core-readiness";

const CORE_READY_MESSAGE = { type: "core-ready" };

describe("isCoreReadyMessage", () => {
  it("recognizes the message the core sends once it is ready", () => {
    expect(isCoreReadyMessage(CORE_READY_MESSAGE)).toBe(true);
    expect(isCoreReadyMessage(structuredClone(CORE_READY_MESSAGE))).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isCoreReadyMessage({ type: "ping" })).toBe(false);
    expect(isCoreReadyMessage("core-ready")).toBe(false);
    expect(isCoreReadyMessage(null)).toBe(false);
    expect(isCoreReadyMessage(undefined)).toBe(false);
    expect(isCoreReadyMessage({})).toBe(false);
  });
});
