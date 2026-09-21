import { describe, expect, it } from "vitest";
import {
  CHILD_PROCESS_EVENT_REASONS,
  withoutReplacedDefaultIntegrations,
} from "./error-reporting-integrations";

function named(...names: string[]) {
  return names.map((name) => ({ name }));
}

describe("withoutReplacedDefaultIntegrations", () => {
  it("drops the minidump uploader, so no crash dump of process memory ever leaves the register", () => {
    const kept = withoutReplacedDefaultIntegrations(
      named("SentryMinidump", "ElectronMinidump", "OnUncaughtException"),
    );

    expect(kept.map(({ name }) => name)).toEqual(["OnUncaughtException"]);
  });

  it("drops the preload injection, so the page's window gets no Sentry API", () => {
    const kept = withoutReplacedDefaultIntegrations(named("PreloadInjection", "ElectronContext"));

    expect(kept.map(({ name }) => name)).toEqual(["ElectronContext"]);
  });

  it("drops the default child process integration, which is replaced by one that reports crashes", () => {
    const kept = withoutReplacedDefaultIntegrations(named("ChildProcess", "ElectronBreadcrumbs"));

    expect(kept.map(({ name }) => name)).toEqual(["ElectronBreadcrumbs"]);
  });

  it("keeps every other default integration, in order", () => {
    const defaults = named("ElectronBreadcrumbs", "Net", "OnUnhandledRejection", "NormalizePaths");

    expect(withoutReplacedDefaultIntegrations(defaults)).toEqual(defaults);
  });
});

describe("CHILD_PROCESS_EVENT_REASONS", () => {
  it("reports a crashed or out-of-memory process as an event of its own", () => {
    expect(CHILD_PROCESS_EVENT_REASONS).toEqual(expect.arrayContaining(["crashed", "oom"]));
  });

  it("still reports the exits the SDK reports by default", () => {
    expect(CHILD_PROCESS_EVENT_REASONS).toEqual(
      expect.arrayContaining(["abnormal-exit", "launch-failed", "integrity-failure"]),
    );
  });
});
