import { errorReportingOptions } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RendererSentry } from "./error-reporting";
import { initializeErrorReporting } from "./error-reporting";

function initializeWithFakeSentry() {
  const init = vi.fn<RendererSentry["init"]>();
  initializeErrorReporting({
    init,
    consoleLoggingIntegration: (options) => ({ name: "ConsoleLogs", options }),
  });
  return init.mock.calls[0]?.[0];
}

describe("initializeErrorReporting", () => {
  it("collects no personal data and scrubs every event, breadcrumb and log it sends", () => {
    expect(initializeWithFakeSentry()).toEqual(expect.objectContaining(errorReportingOptions()));
  });

  it("captures the renderer's info, warning and error console lines as Sentry logs", () => {
    expect(initializeWithFakeSentry()?.integrations).toContainEqual({
      name: "ConsoleLogs",
      options: { levels: ["info", "warn", "error"] },
    });
  });
});
