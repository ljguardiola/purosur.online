import { errorReportingOptions } from "@purosur/contracts";
import type { ElectronMainOptions } from "@sentry/electron/main";
import { describe, expect, it, vi } from "vitest";
import type { ChannelSettings } from "../shared/channel";
import { initializeErrorReporting, type MainSentry } from "./error-reporting";

const settings: ChannelSettings = {
  channel: "staging",
  sentryDsn: "https://key@errors.example.test/1",
  cloudUrl: "https://cloud.example.test",
  dataFolder: "purosur-staging",
};

function initializeWithFakeSentry() {
  const init = vi.fn<MainSentry["init"]>();
  const sentry: MainSentry = {
    init,
    IPCMode: { Protocol: 2 },
    childProcessIntegration: (options) => ({ name: "ChildProcess", options }),
    consoleLoggingIntegration: (options) => ({ name: "ConsoleLogs", options }),
  };
  initializeErrorReporting(settings, sentry);
  return init.mock.calls[0]?.[0];
}

function integrationsOver(options: ElectronMainOptions | undefined, defaults: { name: string }[]) {
  const integrations = options?.integrations;
  return typeof integrations === "function" ? integrations(defaults) : integrations;
}

describe("initializeErrorReporting", () => {
  it("collects no personal data and scrubs every event, breadcrumb and log it sends", () => {
    const options = initializeWithFakeSentry();

    expect(options).toEqual(expect.objectContaining(errorReportingOptions()));
  });

  it("captures the main process's info, warning and error console lines as Sentry logs", () => {
    const options = initializeWithFakeSentry();

    expect(integrationsOver(options, [])).toContainEqual({
      name: "ConsoleLogs",
      options: { levels: ["info", "warn", "error"] },
    });
  });
});
