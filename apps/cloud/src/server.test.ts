import { describe, expect, it, vi } from "vitest";
import { resolvePort, resolveVersion, startServer } from "./server.js";

describe("resolveVersion", () => {
  it("returns APP_VERSION when set", () => {
    expect(resolveVersion({ APP_VERSION: "abc1234" })).toBe("abc1234");
  });

  it("falls back to unknown when APP_VERSION is missing or empty", () => {
    expect(resolveVersion({})).toBe("unknown");
    expect(resolveVersion({ APP_VERSION: "" })).toBe("unknown");
  });
});

describe("resolvePort", () => {
  it("returns the parsed PORT", () => {
    expect(resolvePort({ PORT: "8080" })).toBe(8080);
  });

  it("falls back to 3000 when PORT is missing or not a positive integer", () => {
    expect(resolvePort({})).toBe(3000);
    expect(resolvePort({ PORT: "not-a-number" })).toBe(3000);
    expect(resolvePort({ PORT: "-1" })).toBe(3000);
  });
});

describe("startServer", () => {
  it("initializes Sentry, builds the app with the resolved version, and listens on PORT/0.0.0.0", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = { listen } as unknown as ReturnType<typeof import("./app.js").buildApp>;
    const initSentry = vi.fn();
    const buildApp = vi.fn().mockReturnValue(fakeApp);

    const env = {
      PORT: "4000",
      APP_VERSION: "sha123",
      SENTRY_DSN: "https://public@sentry.example/1",
      SENTRY_ENVIRONMENT: "staging",
    };

    const app = await startServer(env, { initSentry, buildApp });

    expect(initSentry).toHaveBeenCalledWith({
      dsn: "https://public@sentry.example/1",
      environment: "staging",
    });
    expect(buildApp).toHaveBeenCalledWith({ version: "sha123" });
    expect(listen).toHaveBeenCalledWith({ port: 4000, host: "0.0.0.0" });
    expect(app).toBe(fakeApp);
  });
});
