import { describe, expect, it, vi } from "vitest";
import { isCoreRefusedMessage, reportCoreRefusal } from "./core-refusal";

const CORE_REFUSED_MESSAGE = { type: "core-refused", reason: "newer_database" };

describe("isCoreRefusedMessage", () => {
  it("recognizes the message the core sends when it refuses a newer database", () => {
    expect(isCoreRefusedMessage(CORE_REFUSED_MESSAGE)).toBe(true);
    expect(isCoreRefusedMessage(structuredClone(CORE_REFUSED_MESSAGE))).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isCoreRefusedMessage({ type: "core-ready" })).toBe(false);
    expect(isCoreRefusedMessage({ type: "core-refused", reason: "other" })).toBe(false);
    expect(isCoreRefusedMessage({ type: "core-refused" })).toBe(false);
    expect(isCoreRefusedMessage("core-refused")).toBe(false);
    expect(isCoreRefusedMessage(null)).toBe(false);
    expect(isCoreRefusedMessage(undefined)).toBe(false);
    expect(isCoreRefusedMessage({})).toBe(false);
  });
});

describe("reportCoreRefusal", () => {
  it("logs the refusal and reports it as fatal", () => {
    const log = vi.fn();
    const captureMessage = vi.fn();

    reportCoreRefusal({ log, captureMessage });

    const line = "core process: refused a local database migrated by a newer version";
    expect(log).toHaveBeenCalledExactlyOnceWith(line);
    expect(captureMessage).toHaveBeenCalledExactlyOnceWith(line, "fatal");
  });
});
