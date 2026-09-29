import { scrubErrorReport } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { initSentry } from "./sentry.js";

describe("initSentry", () => {
  it("does nothing when no DSN is configured", () => {
    const init = vi.fn();

    initSentry({}, { init });

    expect(init).not.toHaveBeenCalled();
  });

  it("initializes Sentry with the dsn, environment, release and the scrubbing beforeSend when a DSN is configured", () => {
    const init = vi.fn();

    initSentry(
      { dsn: "https://public@sentry.example/1", environment: "staging", release: "sha123" },
      { init },
    );

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@sentry.example/1",
        environment: "staging",
        release: "sha123",
        beforeSend: scrubErrorReport,
      }),
    );
  });
});
