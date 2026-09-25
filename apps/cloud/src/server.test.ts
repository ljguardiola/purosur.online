import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BuildAppOptions, buildApp as buildRealApp } from "./app.js";
import {
  closeRecoveryResources,
  createRecoveryJobQueuePool,
  registerShutdownHandlers,
  reportStartupFailure,
  resolvePort,
  resolveRecoveryEnv,
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

describe("resolveRecoveryEnv", () => {
  it("returns undefined when DATABASE_URL is not set, same as a dev environment with no database", () => {
    expect(resolveRecoveryEnv({})).toBeUndefined();
  });

  const FULL_RECOVERY_ENV = {
    DATABASE_URL: "postgres://user:pass@db/purosur",
    RESEND_API_KEY: "re_test_key",
    RECOVERY_EMAIL_FROM: "Puro Sur <acceso@mail.staging.purosur.online>",
    RECOVERY_EMAIL_REPLY_TO: "purosur.comarca@gmail.com",
    BACKOFFICE_ORIGIN: "https://staging.purosur.online",
  };

  it("resolves every field once DATABASE_URL and the rest are all set, defaulting to the Resend transport", () => {
    expect(resolveRecoveryEnv(FULL_RECOVERY_ENV)).toEqual({
      databaseUrl: "postgres://user:pass@db/purosur",
      emailSender: { transport: "resend", resendApiKey: "re_test_key" },
      emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
      emailReplyTo: "purosur.comarca@gmail.com",
      backofficeOrigin: "https://staging.purosur.online",
    });
  });

  it.each([
    "RESEND_API_KEY",
    "RECOVERY_EMAIL_FROM",
    "RECOVERY_EMAIL_REPLY_TO",
    "BACKOFFICE_ORIGIN",
  ] as const)("throws when DATABASE_URL is set but %s is missing", (missing) => {
    const env = { ...FULL_RECOVERY_ENV, [missing]: undefined };

    expect(() => resolveRecoveryEnv(env)).toThrow(missing);
  });

  describe("RECOVERY_EMAIL_TRANSPORT", () => {
    const { RESEND_API_KEY: _unused, ...ENV_WITHOUT_RESEND_API_KEY } = FULL_RECOVERY_ENV;

    it("selects the log transport, without requiring RESEND_API_KEY, when set to exactly log with a localhost BACKOFFICE_ORIGIN", () => {
      const env = {
        ...ENV_WITHOUT_RESEND_API_KEY,
        RECOVERY_EMAIL_TRANSPORT: "log",
        BACKOFFICE_ORIGIN: "http://localhost:5173",
      };

      expect(resolveRecoveryEnv(env)).toEqual({
        databaseUrl: "postgres://user:pass@db/purosur",
        emailSender: { transport: "log" },
        emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
        emailReplyTo: "purosur.comarca@gmail.com",
        backofficeOrigin: "http://localhost:5173",
      });
    });

    it("selects the log transport with a 127.0.0.1 BACKOFFICE_ORIGIN too", () => {
      const env = {
        ...ENV_WITHOUT_RESEND_API_KEY,
        RECOVERY_EMAIL_TRANSPORT: "log",
        BACKOFFICE_ORIGIN: "http://127.0.0.1:5173",
      };

      expect(resolveRecoveryEnv(env)).toEqual({
        databaseUrl: "postgres://user:pass@db/purosur",
        emailSender: { transport: "log" },
        emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
        emailReplyTo: "purosur.comarca@gmail.com",
        backofficeOrigin: "http://127.0.0.1:5173",
      });
    });

    it("refuses to start, naming RECOVERY_EMAIL_TRANSPORT and BACKOFFICE_ORIGIN, when log is selected with a deployed BACKOFFICE_ORIGIN", () => {
      const env = {
        ...ENV_WITHOUT_RESEND_API_KEY,
        RECOVERY_EMAIL_TRANSPORT: "log",
        BACKOFFICE_ORIGIN: "https://staging.purosur.online",
      };

      expect(() => resolveRecoveryEnv(env)).toThrow(/RECOVERY_EMAIL_TRANSPORT/);
      expect(() => resolveRecoveryEnv(env)).toThrow(/BACKOFFICE_ORIGIN/);
      expect(() => resolveRecoveryEnv(env)).toThrow(/local development only/);
    });

    it("falls back to the Resend transport, still requiring RESEND_API_KEY, when unset", () => {
      const env = { ...ENV_WITHOUT_RESEND_API_KEY };

      expect(() => resolveRecoveryEnv(env)).toThrow("RESEND_API_KEY");
    });

    it.each(["Log", "LOG", "true", "1", "resend-and-log"])(
      "falls back to the Resend transport, still requiring RESEND_API_KEY, rather than logging on an unknown value %s",
      (value) => {
        const env = { ...ENV_WITHOUT_RESEND_API_KEY, RECOVERY_EMAIL_TRANSPORT: value };

        expect(() => resolveRecoveryEnv(env)).toThrow("RESEND_API_KEY");
      },
    );
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
      EDGE_ORIGIN_SECRET: "edge-secret",
    };

    const app = await startServer(env, { initSentry, buildApp }).finally(() =>
      rmSync(staticDir, { recursive: true, force: true }),
    );

    expect(initSentry).toHaveBeenCalledWith({
      dsn: "https://public@sentry.example/1",
      environment: "staging",
    });
    expect(buildApp).toHaveBeenCalledWith({
      version: "sha123",
      edgeOriginSecret: "edge-secret",
      staticDir,
    });
    expect(listen).toHaveBeenCalledWith({ port: 4000, host: "0.0.0.0" });
    expect(app).toBe(fakeApp);
  });

  it("builds the app with an undefined staticDir when none is configured and the default doesn't exist", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = { listen } as unknown as ReturnType<typeof import("./app.js").buildApp>;
    const buildApp = vi.fn().mockReturnValue(fakeApp);

    await startServer({ EDGE_ORIGIN_SECRET: "edge-secret" }, { initSentry: vi.fn(), buildApp });

    expect(buildApp).toHaveBeenCalledWith({
      version: "unknown",
      edgeOriginSecret: "edge-secret",
      staticDir: undefined,
    });
  });

  it("builds the app with no recovery option when DATABASE_URL is not set", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const fakeApp = { listen } as unknown as ReturnType<typeof import("./app.js").buildApp>;
    const buildApp = vi.fn().mockReturnValue(fakeApp);
    const setUpRecovery = vi.fn();

    await startServer(
      { EDGE_ORIGIN_SECRET: "edge-secret" },
      { initSentry: vi.fn(), buildApp, setUpRecovery },
    );

    expect(setUpRecovery).not.toHaveBeenCalled();
    expect(buildApp).toHaveBeenCalledWith({
      version: "unknown",
      edgeOriginSecret: "edge-secret",
      staticDir: undefined,
    });
  });

  it("refuses to start when EDGE_ORIGIN_SECRET is not set", async () => {
    const buildApp = vi.fn();

    await expect(startServer({}, { initSentry: vi.fn(), buildApp })).rejects.toThrow(
      "EDGE_ORIGIN_SECRET",
    );
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("refuses to start without EDGE_ORIGIN_SECRET before opening any database or job-queue resource", async () => {
    const buildApp = vi.fn();
    const setUpRecovery = vi.fn();
    const env = {
      DATABASE_URL: "postgres://user:pass@db/purosur",
      RESEND_API_KEY: "re_test_key",
      RECOVERY_EMAIL_FROM: "Puro Sur <acceso@mail.staging.purosur.online>",
      RECOVERY_EMAIL_REPLY_TO: "purosur.comarca@gmail.com",
      BACKOFFICE_ORIGIN: "https://staging.purosur.online",
    };

    await expect(
      startServer(env, { initSentry: vi.fn(), buildApp, setUpRecovery }),
    ).rejects.toThrow("EDGE_ORIGIN_SECRET");
    expect(setUpRecovery).not.toHaveBeenCalled();
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("wires the resolved recovery infrastructure into the app and closes it when the app closes", async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const onCloseHooks: Array<() => Promise<void>> = [];
    const fakeApp = {
      listen,
      addHook: vi.fn((name: string, hook: () => Promise<void>) => {
        if (name === "onClose") {
          onCloseHooks.push(hook);
        }
      }),
    } as unknown as ReturnType<typeof import("./app.js").buildApp>;
    const buildApp = vi.fn().mockReturnValue(fakeApp);
    const close = vi.fn().mockResolvedValue(undefined);
    const fakeRecovery = {
      db: { marker: "fake-db" },
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      close,
    };
    const setUpRecovery = vi.fn().mockResolvedValue(fakeRecovery);

    const env = {
      DATABASE_URL: "postgres://user:pass@db/purosur",
      RESEND_API_KEY: "re_test_key",
      RECOVERY_EMAIL_FROM: "Puro Sur <acceso@mail.staging.purosur.online>",
      RECOVERY_EMAIL_REPLY_TO: "purosur.comarca@gmail.com",
      BACKOFFICE_ORIGIN: "https://staging.purosur.online",
      EDGE_ORIGIN_SECRET: "edge-secret",
    };

    await startServer(env, { initSentry: vi.fn(), buildApp, setUpRecovery });

    expect(setUpRecovery).toHaveBeenCalledWith({
      databaseUrl: "postgres://user:pass@db/purosur",
      emailSender: { transport: "resend", resendApiKey: "re_test_key" },
      emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
      emailReplyTo: "purosur.comarca@gmail.com",
      backofficeOrigin: "https://staging.purosur.online",
    });
    expect(buildApp).toHaveBeenCalledWith({
      version: "unknown",
      edgeOriginSecret: "edge-secret",
      staticDir: undefined,
      recovery: {
        db: fakeRecovery.db,
        jobQueue: fakeRecovery.jobQueue,
        backofficeOrigin: fakeRecovery.backofficeOrigin,
      },
      session: {
        db: fakeRecovery.db,
        backofficeOrigin: fakeRecovery.backofficeOrigin,
      },
      passkeys: {
        db: fakeRecovery.db,
        backofficeOrigin: fakeRecovery.backofficeOrigin,
      },
      users: {
        db: fakeRecovery.db,
        backofficeOrigin: fakeRecovery.backofficeOrigin,
      },
      roles: {
        db: fakeRecovery.db,
        backofficeOrigin: fakeRecovery.backofficeOrigin,
      },
      categories: {
        db: fakeRecovery.db,
        backofficeOrigin: fakeRecovery.backofficeOrigin,
      },
    });

    expect(onCloseHooks).toHaveLength(1);
    const [onClose] = onCloseHooks;
    if (!onClose) {
      throw new Error("test setup: expected an onClose hook to have been registered");
    }
    await onClose();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("startServer with the real app", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves the Users API routes, not the backoffice's index.html, once a database is configured", async () => {
    const staticDir = mkdtempSync(join(tmpdir(), "cloud-static-users-"));
    dirs.push(staticDir);
    writeFileSync(join(staticDir, "index.html"), "<!doctype html>");
    const builtApps: FastifyInstance[] = [];
    const buildAppWithoutListening = (options: BuildAppOptions): FastifyInstance => {
      const app = buildRealApp(options);
      app.listen = vi.fn().mockResolvedValue("") as unknown as FastifyInstance["listen"];
      builtApps.push(app);
      return app;
    };
    const setUpRecovery = vi.fn().mockResolvedValue({
      db: {},
      jobQueue: { enqueueRecoveryRequest: vi.fn() },
      backofficeOrigin: "https://staging.purosur.online",
      worker: { stop: vi.fn() },
      close: vi.fn().mockResolvedValue(undefined),
    });

    const app = await startServer(
      {
        DATABASE_URL: "postgres://user:pass@db/purosur",
        RESEND_API_KEY: "re_test_key",
        RECOVERY_EMAIL_FROM: "Puro Sur <acceso@mail.staging.purosur.online>",
        RECOVERY_EMAIL_REPLY_TO: "purosur.comarca@gmail.com",
        BACKOFFICE_ORIGIN: "https://staging.purosur.online",
        EDGE_ORIGIN_SECRET: "edge-secret",
        BACKOFFICE_STATIC_DIR: staticDir,
      },
      { initSentry: vi.fn(), buildApp: buildAppWithoutListening, setUpRecovery },
    );

    try {
      const response = await app.inject({
        method: "GET",
        url: "/users",
        headers: { "x-edge-origin-secret": "edge-secret" },
      });

      // No session cookie was sent, so the route's own 401 answers before any database read.
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "unauthenticated" });
      expect(builtApps).toEqual([app]);
    } finally {
      await app.close();
    }
  });
});

describe("createRecoveryJobQueuePool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  class FakePool extends EventEmitter {
    readonly end = vi.fn().mockResolvedValue(undefined);
  }

  it("installs a permanent error handler on the pool it owns, so a disconnected idle client never becomes an unhandled error", () => {
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    createRecoveryJobQueuePool("postgres://user:pass@db/purosur", { createPool });

    const error = new Error("idle client disconnected");
    expect(createPool).toHaveBeenCalledWith("postgres://user:pass@db/purosur");
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    expect(() => pool.emit("error", error)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      "recovery job queue: idle database client failed",
      error,
    );
  });

  it("installs a connect handler on the pool it owns, so graphile-worker's own assertPool never installs (and later removes) its own", () => {
    const pool = new FakePool();
    const createPool = vi.fn().mockReturnValue(pool);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    createRecoveryJobQueuePool("postgres://user:pass@db/purosur", { createPool });

    expect(pool.listenerCount("connect")).toBeGreaterThan(0);
    const client = new EventEmitter();
    pool.emit("connect", client);
    pool.emit("acquire", client);
    const error = new Error("connection terminated unexpectedly");

    expect(client.listenerCount("error")).toBeGreaterThan(0);
    expect(() => client.emit("error", error)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      "recovery job queue: active database client failed",
      error,
    );
  });
});

describe("closeRecoveryResources", () => {
  function recoveryResources(events: string[]) {
    return {
      worker: {
        stop: vi.fn().mockImplementation(async () => {
          events.push("worker stopped");
        }),
      },
      workerUtils: {
        release: vi.fn().mockImplementation(async () => {
          events.push("utilities released");
        }),
      },
      jobQueuePool: {
        end: vi.fn().mockImplementation(async () => {
          events.push("job-queue pool ended");
        }),
      },
      sql: {
        end: vi.fn().mockImplementation(async () => {
          events.push("database client ended");
        }),
      },
    };
  }

  it("releases the job-queue utilities before ending the pool they use, the worker first and the database client last", async () => {
    const events: string[] = [];

    await closeRecoveryResources(recoveryResources(events));

    expect(events).toEqual([
      "worker stopped",
      "utilities released",
      "job-queue pool ended",
      "database client ended",
    ]);
  });

  it("still closes every later resource when two of them fail, then rejects with both failures", async () => {
    const events: string[] = [];
    const resources = recoveryResources(events);
    resources.worker.stop.mockRejectedValue(new Error("worker stop failed"));
    resources.jobQueuePool.end.mockImplementation(async () => {
      events.push("job-queue pool ended");
      throw new Error("pool end failed");
    });

    const failure = await closeRecoveryResources(resources).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(events).toEqual(["utilities released", "job-queue pool ended", "database client ended"]);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error: Error) => error.message)).toEqual([
      expect.stringContaining("worker stop failed"),
      expect.stringContaining("pool end failed"),
    ]);
  });
});

describe("shutdownServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
  });
});
