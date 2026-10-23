import { describe, expect, it, vi } from "vitest";
import { reportCoreReadinessMiss } from "./core-readiness-miss";

describe("reportCoreReadinessMiss", () => {
  it("logs and reports the step the core was still at", () => {
    const log = vi.fn();
    const captureMessage = vi.fn();

    reportCoreReadinessMiss(
      { log, captureMessage },
      { step: "apply_migrations", stepElapsedMs: 28_500 },
      30_000,
    );

    const line =
      "core process: not ready within 30000 ms, still at step apply_migrations after 28500 ms, so it was stopped";
    expect(log).toHaveBeenCalledExactlyOnceWith(line);
    expect(captureMessage).toHaveBeenCalledExactlyOnceWith(line, "error");
  });

  it("says no step was reported when the core never reported one", () => {
    const log = vi.fn();
    const captureMessage = vi.fn();

    reportCoreReadinessMiss(
      { log, captureMessage },
      { step: undefined, stepElapsedMs: undefined },
      30_000,
    );

    const line =
      "core process: not ready within 30000 ms, before reporting any startup step, so it was stopped";
    expect(log).toHaveBeenCalledExactlyOnceWith(line);
    expect(captureMessage).toHaveBeenCalledExactlyOnceWith(line, "error");
  });
});
