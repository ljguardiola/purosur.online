import { afterEach, describe, expect, it, vi } from "vitest";
import { reportRecoveryBookkeepingError, reportRecoveryError } from "./recovery-error-reporting.js";

describe("reportRecoveryError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the given message with the error and reports the error to Sentry, without throwing", () => {
    const captureException = vi.fn().mockReturnValue("event-id");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("connection terminated unexpectedly");

    expect(() =>
      reportRecoveryError("recovery worker: idle database client failed", error, {
        captureException,
      }),
    ).not.toThrow();

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "recovery worker: idle database client failed",
      error,
    );
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
  });
});

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
