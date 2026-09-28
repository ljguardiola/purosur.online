import { describe, expect, it, vi } from "vitest";
import { type ErrorReporterDependencies, startErrorReporting } from "./error-reporter";

const enabled = {
  enabled: true,
  dsn: "https://key@errors.example.test/1",
  environment: "staging",
  release: "abc1234",
} as const;

function setUp(overrides: Partial<ErrorReporterDependencies> = {}) {
  const target = new EventTarget();
  const send = vi.fn();
  const startSending = vi.fn().mockResolvedValue(send);
  const fetchConfiguration = vi.fn().mockResolvedValue(enabled);
  const reporter = startErrorReporting({ target, fetchConfiguration, startSending, ...overrides });
  return { target, send, startSending, reporter };
}

function windowError(error: unknown): Event {
  return Object.assign(new Event("error"), { error });
}

function unhandledRejection(reason: unknown): Event {
  return Object.assign(new Event("unhandledrejection"), { reason });
}

describe("startErrorReporting", () => {
  it("sends, in order, what was reported before the configuration arrived", async () => {
    const { send, reporter } = setUp();
    const first = new Error("first");
    const second = new Error("second");

    reporter.report(first);
    reporter.report(second);
    await reporter.settled;

    expect(send.mock.calls).toEqual([[first], [second]]);
  });

  it("starts sending with the configuration the cloud gave", async () => {
    const { startSending, reporter } = setUp();

    await reporter.settled;

    expect(startSending).toHaveBeenCalledWith(enabled);
  });

  it("sends a report made after reporting started straight away", async () => {
    const { send, reporter } = setUp();
    await reporter.settled;
    const failure = new Error("late");

    reporter.report(failure);

    expect(send).toHaveBeenCalledWith(failure);
  });

  it("keeps an uncaught exception and an unhandled rejection that happen before the configuration arrives", async () => {
    const { target, send, reporter } = setUp();
    const uncaught = new Error("uncaught");
    const rejection = new Error("rejected");

    target.dispatchEvent(windowError(uncaught));
    target.dispatchEvent(unhandledRejection(rejection));
    await reporter.settled;

    expect(send.mock.calls).toEqual([[uncaught], [rejection]]);
  });

  it("leaves window errors to the reporting library once it has started, so none is reported twice", async () => {
    const { target, send, reporter } = setUp();
    await reporter.settled;

    target.dispatchEvent(windowError(new Error("after")));
    target.dispatchEvent(unhandledRejection(new Error("after")));

    expect(send).not.toHaveBeenCalled();
  });

  it("drops what it kept and never starts sending when the cloud says reporting is off", async () => {
    const { target, send, startSending, reporter } = setUp({
      fetchConfiguration: vi.fn().mockResolvedValue({ enabled: false }),
    });

    reporter.report(new Error("kept then dropped"));
    target.dispatchEvent(windowError(new Error("also dropped")));
    await reporter.settled;
    reporter.report(new Error("after"));
    target.dispatchEvent(windowError(new Error("after")));

    expect(startSending).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("stays silent when the reporting library cannot be started", async () => {
    const { send, reporter } = setUp({
      startSending: vi.fn().mockRejectedValue(new Error("chunk failed to load")),
    });

    reporter.report(new Error("kept then dropped"));
    await reporter.settled;
    reporter.report(new Error("after"));

    expect(send).not.toHaveBeenCalled();
  });

  it("stays silent when the configuration cannot be fetched", async () => {
    const { startSending, reporter } = setUp({
      fetchConfiguration: vi.fn().mockRejectedValue(new Error("offline")),
    });

    await reporter.settled;

    expect(startSending).not.toHaveBeenCalled();
  });
});
