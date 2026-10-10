import * as Sentry from "@sentry/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "./error-reporting.js";

// ESM's non-configurable namespace makes vi.spyOn throw on the module's own export; mocking it
// here is what lets the "defaults to..." test spy on it.
vi.mock("@sentry/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry/node")>();
  return { ...actual, captureException: vi.fn() };
});

describe("reportError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the given message with the error and reports the error to Sentry, without throwing", () => {
    const captureException = vi.fn().mockReturnValue("event-id");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("connection terminated unexpectedly");

    expect(() =>
      reportError("recovery worker: idle database client failed", error, {
        captureException,
      }),
    ).not.toThrow();

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "recovery worker: idle database client failed",
      error,
    );
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("swallows a capture that throws, since it reports from inside pg's own error listeners", () => {
    const captureException = vi.fn(() => {
      throw new Error("sentry: transport unavailable");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("connection terminated unexpectedly");

    expect(() =>
      reportError("recovery worker: idle database client failed", error, {
        captureException,
      }),
    ).not.toThrow();

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "recovery worker: idle database client failed",
      error,
    );
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("still reports to Sentry when writing to the console throws", () => {
    const captureException = vi.fn().mockReturnValue("event-id");
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("log stream closed");
    });
    const error = new Error("connection terminated unexpectedly");

    expect(() =>
      reportError("recovery worker: idle database client failed", error, {
        captureException,
      }),
    ).not.toThrow();

    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("defaults to @sentry/node's own captureException when none is injected", () => {
    const captureException = vi.mocked(Sentry.captureException).mockReturnValue("event-id");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("connection terminated unexpectedly");

    expect(() => reportError("recovery worker: idle database client failed", error)).not.toThrow();

    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), error);
  });
});
