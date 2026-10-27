import { describe, expect, it } from "vitest";
import { readCoreStartupStep } from "./core-startup-step";

describe("readCoreStartupStep", () => {
  it.each([
    "set_aside_stale_database",
    "adopt_staged_snapshot",
    "check_local_database",
    "apply_migrations",
    "check_free_disk_space",
    "settle_interrupted_authorizations",
  ])("reads the notice that the core is at %s", (step) => {
    expect(readCoreStartupStep({ type: "core-startup-step", step })).toBe(step);
  });

  it("reads a notice that crossed the process boundary as a copy", () => {
    const message = structuredClone({ type: "core-startup-step", step: "apply_migrations" });

    expect(readCoreStartupStep(message)).toBe("apply_migrations");
  });

  it("reads nothing from a step it does not know", () => {
    expect(readCoreStartupStep({ type: "core-startup-step", step: "open_window" })).toBeUndefined();
    expect(readCoreStartupStep({ type: "core-startup-step", step: "toString" })).toBeUndefined();
    expect(readCoreStartupStep({ type: "core-startup-step", step: 1 })).toBeUndefined();
  });

  it("reads nothing from any other message", () => {
    expect(readCoreStartupStep({ type: "core-ready", step: "apply_migrations" })).toBeUndefined();
    expect(readCoreStartupStep({ type: "core-startup-step" })).toBeUndefined();
    expect(readCoreStartupStep("core-startup-step")).toBeUndefined();
    expect(readCoreStartupStep(null)).toBeUndefined();
    expect(readCoreStartupStep(undefined)).toBeUndefined();
  });
});
