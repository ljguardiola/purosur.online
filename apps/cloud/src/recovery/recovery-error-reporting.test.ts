import { afterEach, describe, expect, it, vi } from "vitest";
import { reportRecoveryBookkeepingError } from "./recovery-error-reporting.js";

describe("reportRecoveryBookkeepingError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the error and reports it to Sentry, without throwing", () => {
    const captureException = vi.fn().mockReturnValue("event-id");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("accumulator upsert failed");

    expect(() => reportRecoveryBookkeepingError(error, { captureException })).not.toThrow();

    expect(captureException).toHaveBeenCalledWith(error);
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), error);
  });

  it("defaults to @sentry/node's own captureException when none is injected", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("accumulator upsert failed");

    expect(() => reportRecoveryBookkeepingError(error)).not.toThrow();

    expect(consoleError).toHaveBeenCalledWith(expect.any(String), error);
  });
});
