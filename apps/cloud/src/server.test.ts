import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerShutdownHandlers,
  reportStartupFailure,
  resolvePort,
  resolveStaticDir,
  resolveVersion,
  shutdownServer,
  startServer,
} from "./server.js";

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

describe("resolveStaticDir", () => {
  const dirs: string[] = [];

  function tempDir(withIndexHtml: boolean): string {
    const dir = mkdtempSync(join(tmpdir(), "cloud-static-default-"));
    dirs.push(dir);
    if (withIndexHtml) {
      writeFileSync(join(dir, "index.html"), "<!doctype html>");
    }
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns BACKOFFICE_STATIC_DIR when it holds a build", () => {
    const dir = tempDir(true);
    expect(resolveStaticDir({ BACKOFFICE_STATIC_DIR: dir }, "/default")).toBe(dir);
  });

  it("refuses to start when BACKOFFICE_STATIC_DIR does not exist", () => {
    expect(() =>
      resolveStaticDir({ BACKOFFICE_STATIC_DIR: "/does/not/exist" }, "/default"),
    ).toThrow("/does/not/exist");
  });

  it("refuses to start when BACKOFFICE_STATIC_DIR has no index.html", () => {
    const dir = tempDir(false);
    expect(() => resolveStaticDir({ BACKOFFICE_STATIC_DIR: dir }, "/default")).toThrow(dir);
  });

  it("returns the default directory when it holds a build", () => {
    const dir = tempDir(true);
    expect(resolveStaticDir({}, dir)).toBe(dir);
  });

  it("returns undefined when the default directory holds no build", () => {
    expect(resolveStaticDir({}, tempDir(false))).toBeUndefined();
    expect(resolveStaticDir({}, "/definitely/does/not/exist/purosur-backoffice")).toBeUndefined();
  });
});

describe("startServer", () => {
  it("initializes Sentry, builds the app with the resolved version and static dir, and listens on PORT/0.0.0.0", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = { listen } as unknown as ReturnType<typeof import("./app.js").buildApp>;
    const initSentry = vi.fn();
    const buildApp = vi.fn().mockReturnValue(fakeApp);

    const staticDir = mkdtempSync(join(tmpdir(), "cloud-static-start-"));
    writeFileSync(join(staticDir, "index.html"), "<!doctype html>");
    const env = {
      PORT: "4000",
      APP_VERSION: "sha123",
      SENTRY_DSN: "https://public@sentry.example/1",
      SENTRY_ENVIRONMENT: "staging",
      BACKOFFICE_STATIC_DIR: staticDir,
    };

    const app = await startServer(env, { initSentry, buildApp }).finally(() =>
      rmSync(staticDir, { recursive: true, force: true }),
    );

    expect(initSentry).toHaveBeenCalledWith({
      dsn: "https://public@sentry.example/1",
      environment: "staging",
    });
    expect(buildApp).toHaveBeenCalledWith({ version: "sha123", staticDir });
    expect(listen).toHaveBeenCalledWith({ port: 4000, host: "0.0.0.0" });
    expect(app).toBe(fakeApp);
  });

  it("builds the app with an undefined staticDir when none is configured and the default doesn't exist", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = { listen } as unknown as ReturnType<typeof import("./app.js").buildApp>;
    const buildApp = vi.fn().mockReturnValue(fakeApp);

    await startServer({}, { initSentry: vi.fn(), buildApp });

    expect(buildApp).toHaveBeenCalledWith({ version: "unknown", staticDir: undefined });
  });
});

describe("shutdownServer", () => {
  it("closes the app, then flushes Sentry, then exits 0", async () => {
    const calls: string[] = [];
    const close = vi.fn(async () => {
      calls.push("close");
    });
    const flush = vi.fn(async (_timeoutMs: number) => {
      calls.push("flush");
      return true;
    });
    const exit = vi.fn((code: number) => {
      calls.push(`exit ${code}`);
    });

    await shutdownServer({ close }, { flush, exit });

    expect(calls).toEqual(["close", "flush", "exit 0"]);
    expect(flush).toHaveBeenCalledWith(expect.any(Number));
  });

  it("still flushes Sentry and exits 1 when closing the app fails", async () => {
    const close = vi.fn().mockRejectedValue(new Error("close failed"));
    const flush = vi.fn().mockResolvedValue(true);
    const exit = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await shutdownServer({ close }, { flush, exit });

    expect(flush).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
    vi.restoreAllMocks();
  });
});

describe("registerShutdownHandlers", () => {
  it("shuts the server down once on SIGTERM or SIGINT, even when both arrive", async () => {
    const listeners = new Map<string, () => void>();
    const signals = {
      once: vi.fn((signal: string, listener: () => void) => {
        listeners.set(signal, listener);
      }),
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const flush = vi.fn().mockResolvedValue(true);
    const exit = vi.fn();

    registerShutdownHandlers({ close }, { signals, flush, exit });

    expect([...listeners.keys()].sort()).toEqual(["SIGINT", "SIGTERM"]);
    listeners.get("SIGTERM")?.();
    listeners.get("SIGINT")?.();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("reportStartupFailure", () => {
  it("captures the error, flushes Sentry, then exits 1", async () => {
    const calls: string[] = [];
    const error = new Error("listen EADDRINUSE");
    const captureException = vi.fn((captured: unknown) => {
      calls.push(`capture ${(captured as Error).message}`);
    });
    const flush = vi.fn(async (_timeoutMs: number) => {
      calls.push("flush");
      return true;
    });
    const exit = vi.fn((code: number) => {
      calls.push(`exit ${code}`);
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await reportStartupFailure(error, { captureException, flush, exit });

    expect(calls).toEqual(["capture listen EADDRINUSE", "flush", "exit 1"]);
    vi.restoreAllMocks();
  });
});
