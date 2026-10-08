import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  changesPageSchema,
  healthCheckSchema,
  openSessionSchema,
  passkeyListSchema,
} from "@purosur/contracts";
import {
  CAPABILITY_PERMISSIONS,
  mayRequestPinCodeFor,
  PERMISSION_KEYS,
  type PermissionKey,
} from "@purosur/domain";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import {
  capabilityAccess,
  OPEN_SESSION_ACCESS,
  OPEN_SESSION_PEEK_ACCESS,
  PUBLIC_ACCESS,
  type RouteAccess,
  type RouteAccessEntry,
  recordAccess,
  SESSION_COOKIE_ACCESS,
} from "./access/route-access.js";
import { SESSION_COOKIE_NAME } from "./access/session-cookie.js";
import { generateSessionId, hashSessionId } from "./access/session-id.js";
import { type BuildAppOptions, buildApp as buildRealApp, databaseRouteOptions } from "./app.js";
import {
  arcaVitalityChecks,
  passkeys,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "./platform/db/schema.js";
import { insertEnrolledInstallation } from "./register/test-support/enrolled-installation.js";
import { insertRequestsUpToLimit } from "./sync/test-support/admitted-requests.js";
import {
  buildTestApp as buildApp,
  TEST_EDGE_ORIGIN_SECRET,
} from "./test-support/build-test-app.js";
import { buildTestDatabase, type TestDatabase } from "./test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "./test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "./test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "./test-support/seeded-location.js";

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

const APP_CLOCK = new Date("2020-06-15T12:00:00.000Z");

describe("BuildAppOptions", () => {
  it("refuses options without the clock", () => {
    expectTypeOf<Omit<BuildAppOptions, "now">>().not.toExtend<BuildAppOptions>();
  });
});

describe("GET /api/health", () => {
  it("responds 200 with status ok and the given version", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "abc1234" });
  });

  it("reaches the enrolled installations when the device routes are wired", async () => {
    const { deviceToken } = await insertEnrolledInstallation(testDatabase.db, { now: APP_CLOCK });
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      devices: {
        db: testDatabase.db,
        rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
        keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { authorization: `Bearer ${deviceToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(healthCheckSchema.parse(response.json()).installation).toEqual({ revoked: false });
  });

  it("tells an enrolled installation the state of ARCA when the health route is wired to the database", async () => {
    const { deviceToken } = await insertEnrolledInstallation(testDatabase.db, { now: APP_CLOCK });
    await testDatabase.db
      .insert(arcaVitalityChecks)
      .values({ checkedAt: new Date(APP_CLOCK.getTime() - 10_000), ok: true });
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      devices: {
        db: testDatabase.db,
        rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
        keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      },
      health: { db: testDatabase.db, certificateFingerprint: "AA:BB" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { authorization: `Bearer ${deviceToken}` },
    });

    expect(healthCheckSchema.parse(response.json()).arca).toEqual({
      token_valid: false,
      probe_ok_at: "2020-06-15T11:59:50.000Z",
      reachable: true,
    });
  });

  it("limits an enrolled installation's health checks when the device routes are wired", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(testDatabase.db, {
      now: APP_CLOCK,
    });
    await insertRequestsUpToLimit(testDatabase.db, deviceId, "health_check", APP_CLOCK);
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      devices: {
        db: testDatabase.db,
        rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
        keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { authorization: `Bearer ${deviceToken}` },
    });

    expect(response.statusCode).toBe(429);
  });
});

describe("GET /api/changes", () => {
  it("pulls the enrolled installation's branch changes when the device routes are wired", async () => {
    const { deviceToken } = await insertEnrolledInstallation(testDatabase.db, { now: APP_CLOCK });
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      devices: {
        db: testDatabase.db,
        rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
        keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/changes?since=0",
      headers: { authorization: `Bearer ${deviceToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(changesPageSchema.parse(response.json()).changes).toHaveLength(4);
  });
});

describe("GET /api/error-reporting", () => {
  const dsn = "https://key@errors.example.test/1";

  it("says reporting is off when no backoffice DSN is configured", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/api/error-reporting" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ enabled: false });
  });

  it("gives the backoffice its DSN, environment and the cloud's own version when a DSN is configured", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      errorReporting: { dsn, environment: "staging" },
    });

    const response = await app.inject({ method: "GET", url: "/api/error-reporting" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      enabled: true,
      dsn,
      environment: "staging",
      release: "abc1234",
    });
  });

  it("answers without a session", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      errorReporting: { dsn, environment: "staging" },
    });

    const response = await app.inject({ method: "GET", url: "/api/error-reporting" });

    expect(response.statusCode).toBe(200);
  });

  it("refuses a DSN that is not a URL when building the app", () => {
    expect(() =>
      buildApp({
        now: () => APP_CLOCK,
        version: "abc1234",
        errorReporting: { dsn: "not a url", environment: "staging" },
      }),
    ).toThrow("BACKOFFICE_SENTRY_DSN must be a URL");
  });
});

describe("the edge origin guard", () => {
  it("refuses a request with no edge secret header with 403 direct_access_rejected", async () => {
    const app = buildRealApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET,
    });

    const response = await app.inject({ method: "GET", url: "/some-route" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "direct_access_rejected",
      message: "this request did not come through the edge",
    });
  });

  it("refuses a request whose edge secret header does not match", async () => {
    const app = buildRealApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET,
    });

    const response = await app.inject({
      method: "GET",
      url: "/some-route",
      headers: { "x-edge-origin-secret": "not-the-real-secret" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("lets a request with the correct edge secret header reach routing", async () => {
    const app = buildRealApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET,
    });

    const response = await app.inject({
      method: "GET",
      url: "/some-route",
      headers: { "x-edge-origin-secret": TEST_EDGE_ORIGIN_SECRET },
    });

    expect(response.statusCode).toBe(404);
  });

  it("exempts GET /api/health even with no edge secret header", async () => {
    const app = buildRealApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET,
    });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
  });

  it("exempts GET /api/health with a query string even with no edge secret header", async () => {
    const app = buildRealApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET,
    });

    const response = await app.inject({ method: "GET", url: "/api/health?probe=1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "abc1234" });
  });

  // `inject()` resolves dot segments before routing, which a real socket does not, so these
  // requests go over an actual listener.
  describe("over a real connection, with the backoffice's static build served for unknown paths", () => {
    let staticDir: string;
    let app: ReturnType<typeof buildRealApp>;
    let port: number;

    beforeEach(async () => {
      staticDir = mkdtempSync(join(tmpdir(), "cloud-edge-static-"));
      writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>backoffice</title>");
      app = buildRealApp({
        now: () => APP_CLOCK,
        version: "abc1234",
        edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET,
        staticDir,
      });
      await app.listen({ host: "127.0.0.1", port: 0 });
      port = (app.server.address() as AddressInfo).port;
    });

    afterEach(async () => {
      await app.close();
      rmSync(staticDir, { recursive: true, force: true });
    });

    function getRawPath(path: string): Promise<{ statusCode: number; body: string }> {
      return new Promise((resolve, reject) => {
        const request = httpRequest(
          { host: "127.0.0.1", port, path, method: "GET" },
          (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
              body += chunk;
            });
            response.on("end", () => resolve({ statusCode: response.statusCode ?? 0, body }));
          },
        );
        request.on("error", reject);
        request.end();
      });
    }

    it("exempts GET /api/health with no edge secret header", async () => {
      const response = await getRawPath("/api/health");

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: "ok", version: "abc1234" });
    });

    it.each(["/api/./health", "/api/x/../health", "/api/%2e%2e/health", "/api/health/"])(
      "refuses GET %s with no edge secret header because it is not the /api/health route",
      async (path) => {
        const response = await getRawPath(path);

        expect(response.statusCode).toBe(403);
        expect(JSON.parse(response.body)).toEqual({
          code: "direct_access_rejected",
          message: "this request did not come through the edge",
        });
      },
    );
  });
});

describe("Strict-Transport-Security", () => {
  const TWO_YEARS_INCLUDING_SUBDOMAINS = "max-age=63072000; includeSubDomains";

  let staticDir: string;
  let app: ReturnType<typeof buildRealApp>;
  let port: number;

  beforeEach(async () => {
    staticDir = mkdtempSync(join(tmpdir(), "cloud-hsts-static-"));
    writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>backoffice</title>");
    mkdirSync(join(staticDir, "assets"));
    writeFileSync(join(staticDir, "assets", "app.js"), "console.log('app');");
    app = buildRealApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET,
      staticDir,
    });
    app.get("/boom", { config: { access: PUBLIC_ACCESS } }, async () => {
      throw new Error("boom");
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    port = (app.server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await app.close();
    rmSync(staticDir, { recursive: true, force: true });
  });

  function send(
    method: string,
    path: string,
    headers: Record<string, string> = { "x-edge-origin-secret": TEST_EDGE_ORIGIN_SECRET },
  ): Promise<{ statusCode: number; strictTransportSecurity: string | undefined }> {
    return new Promise((resolve, reject) => {
      const request = httpRequest(
        { host: "127.0.0.1", port, path, method, headers },
        (response) => {
          response.resume();
          response.on("end", () =>
            resolve({
              statusCode: response.statusCode ?? 0,
              strictTransportSecurity: response.headers["strict-transport-security"],
            }),
          );
        },
      );
      request.on("error", reject);
      request.end();
    });
  }

  it.each([
    ["a route", "GET", "/api/health", 200],
    ["a static asset", "GET", "/assets/app.js", 200],
    ["the page served for a client route", "GET", "/help/getting_started", 200],
    ["a HEAD to a client route", "HEAD", "/help/getting_started", 200],
    ["a path that matches nothing", "GET", "/missing.txt", 404],
    ["a route that throws", "GET", "/boom", 500],
    ["a path that is not valid percent-encoding", "GET", "/%zz", 400],
  ])("is sent with the response to %s", async (_case, method, path, statusCode) => {
    const response = await send(method, path);

    expect(response.statusCode).toBe(statusCode);
    expect(response.strictTransportSecurity).toBe(TWO_YEARS_INCLUDING_SUBDOMAINS);
  });

  it("is sent with the refusal of a request that did not come through the edge", async () => {
    const response = await send("GET", "/some-route", {});

    expect(response.statusCode).toBe(403);
    expect(response.strictTransportSecurity).toBe(TWO_YEARS_INCLUDING_SUBDOMAINS);
  });
});

describe("Sentry error handler wiring", () => {
  it("wires the provided setupFastifyErrorHandler function onto the built app", () => {
    const setupFastifyErrorHandler = vi.fn();

    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234", setupFastifyErrorHandler });

    expect(setupFastifyErrorHandler).toHaveBeenCalledTimes(1);
    expect(setupFastifyErrorHandler).toHaveBeenCalledWith(app);
  });

  it("lets an unhandled route error reach the wired error handler", async () => {
    const captured: unknown[] = [];
    const setupFastifyErrorHandler = vi.fn((fastifyApp: ReturnType<typeof buildApp>) => {
      fastifyApp.setErrorHandler((error, _request, reply) => {
        captured.push(error);
        reply.code(500).send({ status: "error" });
      });
    });

    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234", setupFastifyErrorHandler });
    app.get("/boom", { config: { access: PUBLIC_ACCESS } }, async () => {
      throw new Error("boom");
    });

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(500);
    expect(captured).toHaveLength(1);
    expect((captured[0] as Error).message).toBe("boom");
  });
});

describe("serving the backoffice's static build", () => {
  const dirs: string[] = [];

  function backofficeBuild(): string {
    const dir = mkdtempSync(join(tmpdir(), "cloud-static-"));
    dirs.push(dir);
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>backoffice</title>");
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "app.js"), "console.log('app');");
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves a real static asset from staticDir", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      staticDir: backofficeBuild(),
    });

    const response = await app.inject({ method: "GET", url: "/assets/app.js" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("console.log('app');");
  });

  it("falls back to index.html for a GET to a path that matches no static file or route", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      staticDir: backofficeBuild(),
    });

    const response = await app.inject({ method: "GET", url: "/help/getting_started" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("<!doctype html><title>backoffice</title>");
  });

  it("still serves /api/health normally instead of falling back to index.html", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      staticDir: backofficeBuild(),
    });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "abc1234" });
  });

  it.each([
    "/",
    "/alerts",
    "/products",
    "/categories",
    "/brands",
    "/tags",
    "/prices",
    "/discounts",
    "/inventory",
    "/inventory-counts",
    "/inventory-adjustments",
    "/fiscal-settings",
    "/location-settings",
    "/users",
    "/users/3f2b8c4e-6a1d-4f7e-9b0a-5d2c1e8f7a63",
    "/account",
    "/roles",
    "/registers",
    "/help",
    "/sign-in",
    "/account-recovery",
    "/account-recovery/passkey",
  ])(
    "serves the backoffice page at the screen address %s with every API route wired",
    async (url) => {
      const app = productionWiredApp();

      const response = await app.inject({ method: "GET", url, headers: { accept: "text/html" } });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("<!doctype html><title>backoffice</title>");
    },
  );

  it.each(["GET", "HEAD", "POST"] as const)(
    "answers 404 to a %s on an unknown /api path instead of serving the page",
    async (method) => {
      const app = buildApp({
        now: () => APP_CLOCK,
        version: "abc1234",
        staticDir: backofficeBuild(),
      });

      const response = await app.inject({ method, url: "/api/inventory-unknown" });

      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain("backoffice");
    },
  );

  it.each(["/api", "/api/", "/api?view=all"])(
    "answers 404 to %s instead of serving the page",
    async (url) => {
      const app = buildApp({
        now: () => APP_CLOCK,
        version: "abc1234",
        staticDir: backofficeBuild(),
      });

      const response = await app.inject({ method: "GET", url });

      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain("backoffice");
    },
  );

  it("serves the page at an address that only starts with the letters of the API prefix", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      staticDir: backofficeBuild(),
    });

    const response = await app.inject({ method: "GET", url: "/apiaries" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("<!doctype html><title>backoffice</title>");
  });

  it("falls back to index.html for a HEAD to a client route, same as a GET", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      staticDir: backofficeBuild(),
    });

    const response = await app.inject({ method: "HEAD", url: "/help/getting_started" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it.each(["/assets/old-hash.js", "/robots.txt", "/help/getting_started.png"])(
    "answers 404 instead of index.html for a missing file like %s",
    async (url) => {
      const app = buildApp({
        now: () => APP_CLOCK,
        version: "abc1234",
        staticDir: backofficeBuild(),
      });

      const get = await app.inject({ method: "GET", url });
      const head = await app.inject({ method: "HEAD", url });

      expect(get.statusCode).toBe(404);
      expect(get.body).not.toContain("backoffice");
      expect(head.statusCode).toBe(404);
    },
  );

  it.each(["/assets/app.js", "/help/getting_started"])(
    "sends the security headers with %s",
    async (url) => {
      const app = buildApp({
        now: () => APP_CLOCK,
        version: "abc1234",
        staticDir: backofficeBuild(),
      });

      const response = await app.inject({ method: "GET", url });

      expect(response.headers["content-security-policy"]).toBe(
        "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; " +
          "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; " +
          "frame-ancestors 'none'",
      );
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
    },
  );

  it("lets the backoffice send its error reports to the DSN's origin, and only when a DSN is configured", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      staticDir: backofficeBuild(),
      errorReporting: { dsn: "https://key@errors.example.test/1", environment: "staging" },
    });

    const response = await app.inject({ method: "GET", url: "/assets/app.js" });

    expect(response.headers["content-security-policy"]).toContain(
      "connect-src 'self' https://errors.example.test;",
    );
  });

  it("lets browsers keep a hashed asset for a year without revalidating", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      staticDir: backofficeBuild(),
    });

    const response = await app.inject({ method: "GET", url: "/assets/app.js" });

    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it.each(["/", "/index.html", "/help/getting_started"])(
    "makes browsers revalidate the page served for %s",
    async (url) => {
      const app = buildApp({
        now: () => APP_CLOCK,
        version: "abc1234",
        staticDir: backofficeBuild(),
      });

      const response = await app.inject({ method: "GET", url });

      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-cache");
    },
  );

  it.each([
    ["favicon.ico", "image/vnd.microsoft.icon"],
    ["favicon.svg", "image/svg+xml"],
  ])(
    "serves /%s as a real static file with its icon content type, not the SPA fallback",
    async (file, contentType) => {
      const dir = backofficeBuild();
      writeFileSync(join(dir, file), "isotype-bytes");
      const app = buildApp({ now: () => APP_CLOCK, version: "abc1234", staticDir: dir });

      const response = await app.inject({ method: "GET", url: `/${file}` });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain(contentType);
      expect(response.body).toBe("isotype-bytes");
    },
  );

  it("does not fall back for a non-GET request to an unmatched path", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      staticDir: backofficeBuild(),
    });

    const response = await app.inject({ method: "POST", url: "/help/getting_started" });

    expect(response.statusCode).toBe(404);
  });

  it("keeps the plain 404 behavior when no staticDir is configured", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/help/getting_started" });

    expect(response.statusCode).toBe(404);
  });
});

describe("wiring the recovery routes", () => {
  it("does not register POST /api/account-recoveries when no recovery option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({
      method: "POST",
      url: "/api/account-recoveries",
      payload: { email: "ada@example.com" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("registers POST /api/account-recoveries when a recovery option is given", async () => {
    const enqueued: string[] = [];

    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      recovery: {
        db: testDatabase.db,
        jobQueue: {
          async enqueueRecoveryRequest(request) {
            enqueued.push(request.email);
          },
        },
        backofficeOrigin: "https://staging.purosur.online",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/account-recoveries",
      headers: { origin: "https://staging.purosur.online", "x-real-ip": "203.0.113.10" },
      payload: { email: "ada@example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(enqueued).toEqual(["ada@example.com"]);
  });

  it("does not register the redemption routes when no recovery option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const optionsResponse = await app.inject({
      method: "POST",
      url: "/api/account-recovery-challenges",
      payload: { recovery_token: "a-raw-token" },
    });
    const redeemResponse = await app.inject({
      method: "POST",
      url: "/api/account-recovery-redemptions",
      payload: { recovery_token: "a-raw-token" },
    });

    expect(optionsResponse.statusCode).toBe(404);
    expect(redeemResponse.statusCode).toBe(404);
  });

  it("registers the redemption routes when a recovery option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      recovery: {
        db: testDatabase.db,
        jobQueue: { async enqueueRecoveryRequest() {} },
        backofficeOrigin: "https://staging.purosur.online",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/account-recovery-challenges",
      headers: { origin: "https://staging.purosur.online", "x-real-ip": "203.0.113.10" },
      payload: { recovery_token: "an-unknown-raw-token" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "recovery_token_invalid" });
  });
});

describe("wiring the session routes", () => {
  it("does not register GET /api/sessions/current, its status route, DELETE /api/sessions/current, or the authorization pair when no session option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const readResponse = await app.inject({ method: "GET", url: "/api/sessions/current" });
    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/sessions/current/expiration",
    });
    const signOutResponse = await app.inject({
      method: "DELETE",
      url: "/api/sessions/current",
      headers: { origin: "https://staging.purosur.online" },
    });
    const authorizationOptionsResponse = await app.inject({
      method: "POST",
      url: "/api/sessions/current/authorization-challenges",
      headers: { origin: "https://staging.purosur.online" },
    });
    const authorizationResponse = await app.inject({
      method: "PUT",
      url: "/api/sessions/current/authorization",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(readResponse.statusCode).toBe(404);
    expect(statusResponse.statusCode).toBe(404);
    expect(signOutResponse.statusCode).toBe(404);
    expect(authorizationOptionsResponse.statusCode).toBe(404);
    expect(authorizationResponse.statusCode).toBe(404);
  });

  it("registers GET /api/sessions/current, its status route, DELETE /api/sessions/current, and the authorization pair when a session option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      session: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const readResponse = await app.inject({ method: "GET", url: "/api/sessions/current" });
    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/sessions/current/expiration",
    });
    const signOutResponse = await app.inject({
      method: "DELETE",
      url: "/api/sessions/current",
      headers: { origin: "https://staging.purosur.online" },
    });
    const authorizationOptionsResponse = await app.inject({
      method: "POST",
      url: "/api/sessions/current/authorization-challenges",
      headers: { origin: "https://staging.purosur.online" },
    });
    const authorizationResponse = await app.inject({
      method: "PUT",
      url: "/api/sessions/current/authorization",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(readResponse.statusCode).toBe(401);
    expect(readResponse.json()).toMatchObject({ code: "unauthenticated" });
    expect(statusResponse.statusCode).toBe(401);
    expect(statusResponse.json()).toMatchObject({ code: "unauthenticated" });
    expect(signOutResponse.statusCode).toBe(401);
    expect(signOutResponse.json()).toMatchObject({ code: "unauthenticated" });
    expect(authorizationOptionsResponse.statusCode).toBe(401);
    expect(authorizationOptionsResponse.json()).toMatchObject({ code: "unauthenticated" });
    expect(authorizationResponse.statusCode).toBe(401);
    expect(authorizationResponse.json()).toMatchObject({ code: "unauthenticated" });
  });
});

describe("wiring the users routes", () => {
  it("does not register the users routes when no users option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const list = await app.inject({ method: "GET", url: "/api/users" });
    const read = await app.inject({
      method: "GET",
      url: "/api/users/00000000-0000-0000-0000-000000000000",
    });
    const create = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "PUT",
      url: "/api/users/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });
    const userPasskeys = await app.inject({
      method: "GET",
      url: "/api/users/00000000-0000-0000-0000-000000000000/passkeys",
    });
    const userPasskeyRemove = await app.inject({
      method: "DELETE",
      url: "/api/users/00000000-0000-0000-0000-000000000000/passkeys/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });
    const deactivation = await app.inject({
      method: "PUT",
      url: "/api/users/00000000-0000-0000-0000-000000000000/deactivation",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(404);
    expect(read.statusCode).toBe(404);
    expect(create.statusCode).toBe(404);
    expect(edit.statusCode).toBe(404);
    expect(userPasskeys.statusCode).toBe(404);
    expect(userPasskeyRemove.statusCode).toBe(404);
    expect(deactivation.statusCode).toBe(404);
  });

  it("registers the users routes when a users option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      users: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const list = await app.inject({ method: "GET", url: "/api/users" });
    const read = await app.inject({
      method: "GET",
      url: "/api/users/00000000-0000-0000-0000-000000000000",
    });
    const create = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "PUT",
      url: "/api/users/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });
    const userPasskeys = await app.inject({
      method: "GET",
      url: "/api/users/00000000-0000-0000-0000-000000000000/passkeys",
    });
    const userPasskeyRemove = await app.inject({
      method: "DELETE",
      url: "/api/users/00000000-0000-0000-0000-000000000000/passkeys/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });
    const deactivation = await app.inject({
      method: "PUT",
      url: "/api/users/00000000-0000-0000-0000-000000000000/deactivation",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(401);
    expect(read.statusCode).toBe(401);
    expect(create.statusCode).toBe(401);
    expect(edit.statusCode).toBe(401);
    expect(userPasskeys.statusCode).toBe(401);
    expect(userPasskeyRemove.statusCode).toBe(401);
    expect(deactivation.statusCode).toBe(401);
  });
});

describe("wiring the roles routes", () => {
  it("does not register the roles routes when no roles option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const list = await app.inject({ method: "GET", url: "/api/roles" });
    const catalog = await app.inject({ method: "GET", url: "/api/permission-catalog" });
    const read = await app.inject({
      method: "GET",
      url: "/api/roles/00000000-0000-0000-0000-000000000000",
    });
    const create = await app.inject({
      method: "POST",
      url: "/api/roles",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "PUT",
      url: "/api/roles/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(404);
    expect(catalog.statusCode).toBe(404);
    expect(read.statusCode).toBe(404);
    expect(create.statusCode).toBe(404);
    expect(edit.statusCode).toBe(404);
  });

  it("registers the roles routes when a roles option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      roles: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const list = await app.inject({ method: "GET", url: "/api/roles" });
    const catalog = await app.inject({
      method: "GET",
      url: "/api/permission-catalog",
      headers: { origin: "https://staging.purosur.online" },
    });
    const read = await app.inject({
      method: "GET",
      url: "/api/roles/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });
    const create = await app.inject({
      method: "POST",
      url: "/api/roles",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "PUT",
      url: "/api/roles/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(401);
    expect(catalog.statusCode).toBe(401);
    expect(read.statusCode).toBe(401);
    expect(create.statusCode).toBe(401);
    expect(edit.statusCode).toBe(401);
  });
});

describe("wiring the categories routes", () => {
  it("does not register the categories routes when no categories option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const list = await app.inject({ method: "GET", url: "/api/categories" });
    const create = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "PUT",
      url: "/api/categories/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(404);
    expect(create.statusCode).toBe(404);
    expect(edit.statusCode).toBe(404);
  });

  it("registers the categories routes when a categories option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      categories: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const list = await app.inject({ method: "GET", url: "/api/categories" });
    const create = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "PUT",
      url: "/api/categories/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(401);
    expect(create.statusCode).toBe(401);
    expect(edit.statusCode).toBe(401);
  });
});

describe("wiring the brands routes", () => {
  const ORIGIN = { origin: "https://staging.purosur.online" };
  const ID = "00000000-0000-0000-0000-000000000000";

  async function brandsResponses(app: ReturnType<typeof buildApp>): Promise<number[]> {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/api/brands" }),
      app.inject({ method: "POST", url: "/api/brands", headers: ORIGIN }),
      app.inject({ method: "PUT", url: `/api/brands/${ID}`, headers: ORIGIN }),
      app.inject({ method: "PUT", url: `/api/brands/${ID}/deactivation`, headers: ORIGIN }),
      app.inject({ method: "DELETE", url: `/api/brands/${ID}/deactivation`, headers: ORIGIN }),
    ]);
    return responses.map((response) => response.statusCode);
  }

  it("does not register the brands routes when no brands option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    expect(await brandsResponses(app)).toEqual([404, 404, 404, 404, 404]);
  });

  it("registers the brands routes when a brands option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      brands: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    expect(await brandsResponses(app)).toEqual([401, 401, 401, 401, 401]);
  });
});

describe("wiring the tags routes", () => {
  const ORIGIN = { origin: "https://staging.purosur.online" };
  const ID = "00000000-0000-0000-0000-000000000000";

  async function tagsResponses(app: ReturnType<typeof buildApp>): Promise<number[]> {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/api/tags" }),
      app.inject({ method: "POST", url: "/api/tags", headers: ORIGIN }),
      app.inject({ method: "PUT", url: `/api/tags/${ID}`, headers: ORIGIN }),
      app.inject({ method: "PUT", url: `/api/tags/${ID}/deactivation`, headers: ORIGIN }),
      app.inject({ method: "DELETE", url: `/api/tags/${ID}/deactivation`, headers: ORIGIN }),
    ]);
    return responses.map((response) => response.statusCode);
  }

  it("does not register the tags routes when no tags option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    expect(await tagsResponses(app)).toEqual([404, 404, 404, 404, 404]);
  });

  it("registers the tags routes when a tags option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      tags: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    expect(await tagsResponses(app)).toEqual([401, 401, 401, 401, 401]);
  });
});

describe("wiring the products routes", () => {
  it("does not register the products routes when no products option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const list = await app.inject({ method: "GET", url: "/api/products" });
    const create = await app.inject({
      method: "POST",
      url: "/api/products",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "PUT",
      url: "/api/products/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });
    const internalBarcode = await app.inject({
      method: "POST",
      url: "/api/internal-barcodes",
      headers: { origin: "https://staging.purosur.online" },
    });
    const labels = await app.inject({
      method: "POST",
      url: "/api/label-sheets",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(404);
    expect(create.statusCode).toBe(404);
    expect(edit.statusCode).toBe(404);
    expect(internalBarcode.statusCode).toBe(404);
    expect(labels.statusCode).toBe(404);
  });

  it("registers the products routes when a products option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      products: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const list = await app.inject({ method: "GET", url: "/api/products" });
    const create = await app.inject({
      method: "POST",
      url: "/api/products",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "PUT",
      url: "/api/products/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });
    const internalBarcode = await app.inject({
      method: "POST",
      url: "/api/internal-barcodes",
      headers: { origin: "https://staging.purosur.online" },
    });
    const labels = await app.inject({
      method: "POST",
      url: "/api/label-sheets",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(401);
    expect(create.statusCode).toBe(401);
    expect(edit.statusCode).toBe(401);
    expect(internalBarcode.statusCode).toBe(401);
    expect(labels.statusCode).toBe(401);
  });
});

describe("wiring the discounts routes", () => {
  const ORIGIN = { origin: "https://staging.purosur.online" };
  const ID = "00000000-0000-0000-0000-000000000000";

  async function discountsResponses(app: ReturnType<typeof buildApp>): Promise<number[]> {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/api/discounts" }),
      app.inject({ method: "POST", url: "/api/discounts", headers: ORIGIN }),
      app.inject({ method: "PUT", url: `/api/discounts/${ID}`, headers: ORIGIN }),
      app.inject({ method: "GET", url: "/api/discount-targets" }),
    ]);
    return responses.map((response) => response.statusCode);
  }

  it("does not register the discounts routes when no discounts option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    expect(await discountsResponses(app)).toEqual([404, 404, 404, 404]);
  });

  it("registers the discounts routes when a discounts option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      discounts: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    expect(await discountsResponses(app)).toEqual([401, 401, 401, 401]);
  });
});

describe("wiring the prices routes", () => {
  it("does not register the prices routes when no prices option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const list = await app.inject({ method: "GET", url: "/api/prices" });
    const setPrice = await app.inject({
      method: "PUT",
      url: "/api/prices/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });
    const confirmation = await app.inject({
      method: "POST",
      url: "/api/prices/00000000-0000-0000-0000-000000000000/confirmations",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(404);
    expect(setPrice.statusCode).toBe(404);
    expect(confirmation.statusCode).toBe(404);
  });

  it("registers the prices routes when a prices option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      prices: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const list = await app.inject({ method: "GET", url: "/api/prices" });
    const setPrice = await app.inject({
      method: "PUT",
      url: "/api/prices/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });
    const confirmation = await app.inject({
      method: "POST",
      url: "/api/prices/00000000-0000-0000-0000-000000000000/confirmations",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(401);
    expect(setPrice.statusCode).toBe(401);
    expect(confirmation.statusCode).toBe(401);
  });
});

describe("wiring the sales report routes", () => {
  const reportRequests = [
    { method: "GET", url: "/api/reports/sales-by-day" },
    { method: "GET", url: "/api/reports/registers" },
  ] as const;

  async function statusCodes(app: ReturnType<typeof buildApp>): Promise<number[]> {
    const responses = await Promise.all(
      reportRequests.map((request) =>
        app.inject({ ...request, headers: { origin: "https://staging.purosur.online" } }),
      ),
    );
    return responses.map((response) => response.statusCode);
  }

  it("does not register the sales report routes when no salesReports option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    expect(await statusCodes(app)).toEqual(reportRequests.map(() => 404));
  });

  it("registers the sales report routes when a salesReports option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      salesReports: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    expect(await statusCodes(app)).toEqual(reportRequests.map(() => 401));
  });
});

describe("wiring the refund routes", () => {
  const refundRequests = [
    { method: "GET", url: "/api/refunds/pending" },
    { method: "POST", url: "/api/refunds/00000000-0000-4000-8000-000000000000/completion" },
  ] as const;

  async function statusCodes(app: ReturnType<typeof buildApp>): Promise<number[]> {
    const responses = await Promise.all(
      refundRequests.map((request) =>
        app.inject({ ...request, headers: { origin: "https://staging.purosur.online" } }),
      ),
    );
    return responses.map((response) => response.statusCode);
  }

  it("does not register the refund routes when no refunds option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    expect(await statusCodes(app)).toEqual(refundRequests.map(() => 404));
  });

  it("registers the refund routes when a refunds option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      refunds: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    expect(await statusCodes(app)).toEqual(refundRequests.map(() => 401));
  });
});

describe("wiring the stock routes", () => {
  const stockRequests = [
    { method: "GET", url: "/api/inventory-levels" },
    { method: "GET", url: "/api/inventory-items" },
    { method: "GET", url: "/api/inventory-counts" },
    { method: "POST", url: "/api/inventory-counts" },
    {
      method: "GET",
      url: "/api/inventory-levels/00000000-0000-0000-0000-000000000000",
    },
    { method: "GET", url: "/api/inventory-movements" },
    { method: "GET", url: "/api/inventory-movement-reasons" },
    { method: "POST", url: "/api/inventory-losses" },
    { method: "POST", url: "/api/inventory-adjustments" },
  ] as const;

  const formerStockRequests = [
    { method: "GET", url: "/api/stock/balances" },
    { method: "GET", url: "/api/stock/products" },
    { method: "GET", url: "/api/stock/counts" },
    { method: "POST", url: "/api/stock/counts" },
    {
      method: "GET",
      url: "/api/stock/products/00000000-0000-0000-0000-000000000000/expected-balance",
    },
    { method: "GET", url: "/api/stock/movements" },
    { method: "POST", url: "/api/stock/losses" },
    { method: "POST", url: "/api/stock/adjustments" },
  ] as const;

  async function statusCodes(app: ReturnType<typeof buildApp>): Promise<number[]> {
    const responses = await Promise.all(
      stockRequests.map((request) =>
        app.inject({ ...request, headers: { origin: "https://staging.purosur.online" } }),
      ),
    );
    return responses.map((response) => response.statusCode);
  }

  it("does not register the stock routes when no stock option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    expect(await statusCodes(app)).toEqual(stockRequests.map(() => 404));
  });

  it("registers the stock routes when a stock option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      stock: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    expect(await statusCodes(app)).toEqual(stockRequests.map(() => 401));
  });

  it("no longer answers the former stock paths", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      stock: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const responses = await Promise.all(
      formerStockRequests.map((request) =>
        app.inject({ ...request, headers: { origin: "https://staging.purosur.online" } }),
      ),
    );

    expect(responses.map((response) => response.statusCode)).toEqual(
      formerStockRequests.map(() => 404),
    );
  });
});

describe("wiring the registers routes", () => {
  it("does not register the registers routes when no registers option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const list = await app.inject({ method: "GET", url: "/api/registers" });
    const create = await app.inject({
      method: "POST",
      url: "/api/registers",
      headers: { origin: "https://staging.purosur.online" },
    });
    const emitCode = await app.inject({
      method: "POST",
      url: "/api/registers/00000000-0000-0000-0000-000000000000/device-codes",
      headers: { origin: "https://staging.purosur.online" },
    });

    const coverage = await app.inject({ method: "GET", url: "/api/registers/coverage" });

    expect(list.statusCode).toBe(404);
    expect(create.statusCode).toBe(404);
    expect(emitCode.statusCode).toBe(404);
    expect(coverage.statusCode).toBe(404);
  });

  it("registers the registers routes when a registers option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      registers: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const list = await app.inject({ method: "GET", url: "/api/registers" });
    const create = await app.inject({
      method: "POST",
      url: "/api/registers",
      headers: { origin: "https://staging.purosur.online" },
    });
    const emitCode = await app.inject({
      method: "POST",
      url: "/api/registers/00000000-0000-0000-0000-000000000000/device-codes",
      headers: { origin: "https://staging.purosur.online" },
    });

    const coverage = await app.inject({ method: "GET", url: "/api/registers/coverage" });

    expect(list.statusCode).toBe(401);
    expect(create.statusCode).toBe(401);
    expect(emitCode.statusCode).toBe(401);
    expect(coverage.statusCode).toBe(401);
  });
});

describe("wiring the register point of sale routes", () => {
  it.each([
    ["GET", "/api/registers/points-of-sale"],
    ["PUT", "/api/registers/00000000-0000-0000-0000-000000000000/point-of-sale"],
  ])("%s %s: answers according to the registersPointsOfSale option", async (method, url) => {
    const unwired = buildApp({ now: () => APP_CLOCK, version: "abc1234" });
    const wired = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      registersPointsOfSale: {
        db: testDatabase.db,
        backofficeOrigin: "https://staging.purosur.online",
      },
    });
    const request = {
      method: method as "GET" | "PUT",
      url,
      headers: { origin: "https://staging.purosur.online" },
    };

    expect((await unwired.inject(request)).statusCode).toBe(404);
    expect((await wired.inject(request)).statusCode).toBe(401);
  });
});

describe("wiring the device enrollment route", () => {
  it("does not register POST /api/devices when no devices option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({ method: "POST", url: "/api/devices", payload: {} });

    expect(response.statusCode).toBe(404);
  });

  it("registers POST /api/devices, answering without a session, when a devices option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      devices: {
        db: testDatabase.db,
        rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
        keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      },
    });

    const response = await app.inject({ method: "POST", url: "/api/devices", payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("wiring the first PIN code route", () => {
  it("does not register POST /api/first-pin-codes when no firstPinCodes option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({ method: "POST", url: "/api/first-pin-codes", payload: {} });

    expect(response.statusCode).toBe(404);
  });

  it("registers POST /api/first-pin-codes, refusing a request without a device token, when a firstPinCodes option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      firstPinCodes: {
        db: testDatabase.db,
        rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
        keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      },
    });

    const response = await app.inject({ method: "POST", url: "/api/first-pin-codes", payload: {} });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "device_token_rejected" });
  });
});

describe("wiring the device token rotation route", () => {
  it("does not register POST /api/devices/current/tokens when no devices option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({ method: "POST", url: "/api/devices/current/tokens" });

    expect(response.statusCode).toBe(404);
  });

  it("registers POST /api/devices/current/tokens, refusing a request without a device token, when a devices option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      devices: {
        db: testDatabase.db,
        rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
        keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
      },
    });

    const response = await app.inject({ method: "POST", url: "/api/devices/current/tokens" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "device_token_rejected" });
  });
});

describe("wiring the branch settings routes", () => {
  it("does not register GET /api/locations/current/settings when no branchSettings option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/api/locations/current/settings" });

    expect(response.statusCode).toBe(404);
  });

  it("registers GET /api/locations/current/settings when a branchSettings option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      branchSettings: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/locations/current/settings",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("does not register PUT /api/locations/current/settings when no branchSettings option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({ method: "PUT", url: "/api/locations/current/settings" });

    expect(response.statusCode).toBe(404);
  });

  it("registers PUT /api/locations/current/settings when a branchSettings option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      branchSettings: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/locations/current/settings",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });
});

describe("wiring the issuer identification routes", () => {
  const authorizedCuit = FICTIONAL_CERTIFICATE_CUIT;

  it("does not register GET /api/fiscal-settings/issuer-identification when no issuerIdentification option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({
      method: "GET",
      url: "/api/fiscal-settings/issuer-identification",
    });

    expect(response.statusCode).toBe(404);
  });

  it("registers GET /api/fiscal-settings/issuer-identification when an issuerIdentification option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      issuerIdentification: {
        db: testDatabase.db,
        backofficeOrigin: "https://staging.purosur.online",
        authorizedCuit,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/fiscal-settings/issuer-identification",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("does not register PUT /api/fiscal-settings/issuer-identification when no issuerIdentification option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({
      method: "PUT",
      url: "/api/fiscal-settings/issuer-identification",
    });

    expect(response.statusCode).toBe(404);
  });

  it("registers PUT /api/fiscal-settings/issuer-identification when an issuerIdentification option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      issuerIdentification: {
        db: testDatabase.db,
        backofficeOrigin: "https://staging.purosur.online",
        authorizedCuit,
      },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/fiscal-settings/issuer-identification",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });
});

describe("wiring the buyer-identification threshold routes", () => {
  it.each([
    ["GET", "does not register", false],
    ["POST", "does not register", false],
    ["GET", "registers", true],
    ["POST", "registers", true],
  ])(
    "%s /api/buyer-identification-thresholds: %s it according to the buyerIdentificationThresholds option",
    async (method, _verb, wired) => {
      const app = buildApp({
        now: () => APP_CLOCK,
        version: "abc1234",
        ...(wired && {
          buyerIdentificationThresholds: {
            db: testDatabase.db,
            backofficeOrigin: "https://staging.purosur.online",
          },
        }),
      });

      const response = await app.inject({
        method: method as "GET" | "POST",
        url: "/api/buyer-identification-thresholds",
        headers: { origin: "https://staging.purosur.online" },
      });

      expect(response.statusCode).toBe(wired ? 401 : 404);
    },
  );
});

describe("wiring the fiscal address routes", () => {
  it.each([
    ["GET", "/api/fiscal-addresses"],
    ["POST", "/api/fiscal-addresses"],
    ["PUT", "/api/fiscal-addresses/00000000-0000-0000-0000-000000000000"],
  ])("%s %s: answers according to the fiscalAddresses option", async (method, url) => {
    const unwired = buildApp({ now: () => APP_CLOCK, version: "abc1234" });
    const wired = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      fiscalAddresses: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });
    const request = {
      method: method as "GET" | "POST" | "PUT",
      url,
      headers: { origin: "https://staging.purosur.online" },
    };

    expect((await unwired.inject(request)).statusCode).toBe(404);
    expect((await wired.inject(request)).statusCode).toBe(401);
  });
});

describe("wiring the passkeys routes", () => {
  it("does not register GET /api/account/passkeys when no passkeys option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/api/account/passkeys" });

    expect(response.statusCode).toBe(404);
  });

  it("registers GET /api/account/passkeys when a passkeys option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      passkeys: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const response = await app.inject({ method: "GET", url: "/api/account/passkeys" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("does not register the registration or removal routes when no passkeys option is given", async () => {
    const app = buildApp({ now: () => APP_CLOCK, version: "abc1234" });

    const registrationOptions = await app.inject({
      method: "POST",
      url: "/api/account/passkey-challenges",
      headers: { origin: "https://staging.purosur.online" },
    });
    const remove = await app.inject({
      method: "DELETE",
      url: "/api/account/passkeys/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(registrationOptions.statusCode).toBe(404);
    expect(remove.statusCode).toBe(404);
  });

  it("registers the registration and removal routes when a passkeys option is given", async () => {
    const app = buildApp({
      now: () => APP_CLOCK,
      version: "abc1234",
      passkeys: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const registrationOptions = await app.inject({
      method: "POST",
      url: "/api/account/passkey-challenges",
      headers: { origin: "https://staging.purosur.online" },
    });
    const remove = await app.inject({
      method: "DELETE",
      url: "/api/account/passkeys/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(registrationOptions.statusCode).toBe(401);
    expect(remove.statusCode).toBe(401);
  });
});

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

const productionStaticDirs: string[] = [];

afterAll(() => {
  for (const dir of productionStaticDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function productionWiredApp() {
  const staticDir = mkdtempSync(join(tmpdir(), "cloud-static-"));
  productionStaticDirs.push(staticDir);
  writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>backoffice</title>");
  return buildApp({
    now: () => APP_CLOCK,
    version: "abc1234",
    staticDir,
    ...databaseRouteOptions({
      db: testDatabase.db,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      recoveryJobQueue: { async enqueueRecoveryRequest() {} },
      authorizedCuit: FICTIONAL_CERTIFICATE_CUIT,
      certificateFingerprint: "AA:BB",
      deviceTokenRotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
      installationKeysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    }),
  });
}

describe("wiring the register and device routes", () => {
  it("no longer answers the former register and device paths", async () => {
    const app = productionWiredApp();
    const formerRequests = [
      {
        method: "POST",
        url: "/api/registers/00000000-0000-0000-0000-000000000000/enrollment-code",
      },
      { method: "POST", url: "/api/devices/enroll" },
      { method: "POST", url: "/api/devices/rotate-token" },
    ] as const;

    const responses = await Promise.all(
      formerRequests.map((request) =>
        app.inject({ ...request, headers: { origin: BACKOFFICE_ORIGIN } }),
      ),
    );

    expect(responses.map((response) => response.statusCode)).toEqual(formerRequests.map(() => 404));
  });
});

describe("wiring the alerts routes", () => {
  it("no longer answers the former alert closing path", async () => {
    const app = productionWiredApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/alerts/00000000-0000-0000-0000-000000000000/close",
      headers: { origin: BACKOFFICE_ORIGIN },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("the route access inventory", () => {
  it("covers every route the production wiring registers, each with one access level", async () => {
    const app = productionWiredApp();
    await app.ready();

    expect(app.routeAccessInventory()).toEqual([
      { method: "GET", url: "/api/error-reporting", access: PUBLIC_ACCESS },
      { method: "POST", url: "/api/account-recoveries", access: PUBLIC_ACCESS },
      { method: "POST", url: "/api/account-recovery-challenges", access: PUBLIC_ACCESS },
      { method: "POST", url: "/api/account-recovery-redemptions", access: PUBLIC_ACCESS },
      { method: "POST", url: "/api/authentication-challenges", access: PUBLIC_ACCESS },
      { method: "POST", url: "/api/sessions", access: PUBLIC_ACCESS },
      { method: "GET", url: "/api/sessions/current", access: OPEN_SESSION_ACCESS },
      { method: "GET", url: "/api/sessions/current/expiration", access: OPEN_SESSION_PEEK_ACCESS },
      { method: "DELETE", url: "/api/sessions/current", access: SESSION_COOKIE_ACCESS },
      {
        method: "POST",
        url: "/api/sessions/current/authorization-challenges",
        access: OPEN_SESSION_ACCESS,
      },
      { method: "PUT", url: "/api/sessions/current/authorization", access: OPEN_SESSION_ACCESS },
      { method: "GET", url: "/api/account/passkeys", access: OPEN_SESSION_ACCESS },
      {
        method: "POST",
        url: "/api/account/passkey-challenges",
        access: OPEN_SESSION_ACCESS,
      },
      { method: "POST", url: "/api/account/passkeys", access: OPEN_SESSION_ACCESS },
      { method: "DELETE", url: "/api/account/passkeys/:id", access: OPEN_SESSION_ACCESS },
      {
        method: "GET",
        url: "/api/users",
        access: capabilityAccess("users_area"),
      },
      {
        method: "GET",
        url: "/api/users/:id",
        access: capabilityAccess("users_area"),
      },
      { method: "POST", url: "/api/users", access: capabilityAccess("manage_users") },
      { method: "PUT", url: "/api/users/:id", access: capabilityAccess("manage_users") },
      { method: "GET", url: "/api/users/:id/passkeys", access: capabilityAccess("manage_users") },
      {
        method: "DELETE",
        url: "/api/users/:id/passkeys/:passkeyId",
        access: capabilityAccess("manage_users"),
      },
      {
        method: "PUT",
        url: "/api/users/:id/deactivation",
        access: capabilityAccess("deactivate_users"),
      },
      {
        method: "POST",
        url: "/api/users/:id/pin-codes",
        access: recordAccess("id", mayRequestPinCodeFor),
      },
      {
        method: "DELETE",
        url: "/api/users/:id/deactivation",
        access: capabilityAccess("reactivate_users"),
      },
      { method: "GET", url: "/api/roles", access: capabilityAccess("manage_roles") },
      { method: "GET", url: "/api/permission-catalog", access: OPEN_SESSION_ACCESS },
      { method: "GET", url: "/api/roles/:id", access: capabilityAccess("manage_roles") },
      { method: "POST", url: "/api/roles", access: capabilityAccess("manage_roles") },
      { method: "PUT", url: "/api/roles/:id", access: capabilityAccess("manage_roles") },
      {
        method: "GET",
        url: "/api/locations/current/settings",
        access: capabilityAccess("branch_area"),
      },
      {
        method: "PUT",
        url: "/api/locations/current/settings",
        access: capabilityAccess("branch_area"),
      },
      {
        method: "GET",
        url: "/api/fiscal-settings/issuer-identification",
        access: capabilityAccess("cash_area"),
      },
      {
        method: "PUT",
        url: "/api/fiscal-settings/issuer-identification",
        access: capabilityAccess("cash_area"),
      },
      {
        method: "GET",
        url: "/api/buyer-identification-thresholds",
        access: capabilityAccess("cash_area"),
      },
      {
        method: "POST",
        url: "/api/buyer-identification-thresholds",
        access: capabilityAccess("cash_area"),
      },
      {
        method: "GET",
        url: "/api/fiscal-addresses",
        access: capabilityAccess("cash_area"),
      },
      {
        method: "POST",
        url: "/api/fiscal-addresses",
        access: capabilityAccess("cash_area"),
      },
      {
        method: "PUT",
        url: "/api/fiscal-addresses/:id",
        access: capabilityAccess("cash_area"),
      },
      {
        method: "GET",
        url: "/api/categories",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "POST",
        url: "/api/categories",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "PUT",
        url: "/api/categories/:id",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "GET",
        url: "/api/brands",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "POST",
        url: "/api/brands",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "PUT",
        url: "/api/brands/:id",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "PUT",
        url: "/api/brands/:id/deactivation",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "DELETE",
        url: "/api/brands/:id/deactivation",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "GET",
        url: "/api/tags",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "POST",
        url: "/api/tags",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "PUT",
        url: "/api/tags/:id",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "PUT",
        url: "/api/tags/:id/deactivation",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "DELETE",
        url: "/api/tags/:id/deactivation",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "GET",
        url: "/api/products",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "POST",
        url: "/api/products",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "PUT",
        url: "/api/products/:id",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "PUT",
        url: "/api/products/:id/deactivation",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "POST",
        url: "/api/internal-barcodes",
        access: capabilityAccess("products_and_categories"),
      },
      {
        method: "POST",
        url: "/api/label-sheets",
        access: capabilityAccess("products_and_categories"),
      },
      { method: "GET", url: "/api/alerts", access: OPEN_SESSION_ACCESS },
      { method: "GET", url: "/api/alerts/overview", access: OPEN_SESSION_ACCESS },
      { method: "GET", url: "/api/alerts/:id", access: OPEN_SESSION_ACCESS },
      {
        method: "PUT",
        url: "/api/alerts/:id/closure",
        access: capabilityAccess("close_alerts_manually"),
      },
      {
        method: "GET",
        url: "/api/prices",
        access: capabilityAccess("prices_area"),
      },
      {
        method: "PUT",
        url: "/api/prices/:productId",
        access: capabilityAccess("prices_area"),
      },
      {
        method: "POST",
        url: "/api/prices/:productId/confirmations",
        access: capabilityAccess("prices_area"),
      },
      {
        method: "GET",
        url: "/api/discounts",
        access: capabilityAccess("promotions"),
      },
      {
        method: "POST",
        url: "/api/discounts",
        access: capabilityAccess("promotions"),
      },
      {
        method: "PUT",
        url: "/api/discounts/:id",
        access: capabilityAccess("promotions"),
      },
      {
        method: "GET",
        url: "/api/discount-targets",
        access: capabilityAccess("promotions"),
      },
      {
        method: "GET",
        url: "/api/inventory-levels",
        access: capabilityAccess("stock_balances"),
      },
      {
        method: "GET",
        url: "/api/inventory-items",
        access: capabilityAccess("stock_area"),
      },
      {
        method: "GET",
        url: "/api/inventory-counts",
        access: capabilityAccess("stock_counts"),
      },
      {
        method: "POST",
        url: "/api/inventory-counts",
        access: capabilityAccess("stock_counts"),
      },
      {
        method: "GET",
        url: "/api/inventory-levels/:productId",
        access: capabilityAccess("stock_balances"),
      },
      {
        method: "GET",
        url: "/api/inventory-movements",
        access: capabilityAccess("stock_movements"),
      },
      {
        method: "GET",
        url: "/api/inventory-movement-reasons",
        access: capabilityAccess("stock_movements"),
      },
      {
        method: "POST",
        url: "/api/inventory-losses",
        access: capabilityAccess("stock_losses"),
      },
      {
        method: "POST",
        url: "/api/inventory-adjustments",
        access: capabilityAccess("stock_adjustments"),
      },
      {
        method: "GET",
        url: "/api/reports/sales-by-day",
        access: capabilityAccess("reports_area"),
      },
      {
        method: "GET",
        url: "/api/reports/registers",
        access: capabilityAccess("reports_area"),
      },
      {
        method: "GET",
        url: "/api/refunds/pending",
        access: capabilityAccess("refunds_area"),
      },
      {
        method: "POST",
        url: "/api/refunds/:id/completion",
        access: capabilityAccess("refunds_area"),
      },
      {
        method: "GET",
        url: "/api/registers",
        access: capabilityAccess("registers_area"),
      },
      {
        method: "POST",
        url: "/api/registers",
        access: capabilityAccess("registers_area"),
      },
      {
        method: "GET",
        url: "/api/registers/coverage",
        access: capabilityAccess("registers_area"),
      },
      {
        method: "POST",
        url: "/api/registers/:id/device-codes",
        access: capabilityAccess("registers_area"),
      },
      {
        method: "GET",
        url: "/api/registers/points-of-sale",
        access: capabilityAccess("cash_area"),
      },
      {
        method: "PUT",
        url: "/api/registers/:id/point-of-sale",
        access: capabilityAccess("cash_area"),
      },
      { method: "GET", url: "/api/health", access: PUBLIC_ACCESS },
      { method: "POST", url: "/api/devices", access: PUBLIC_ACCESS },
      { method: "GET", url: "/api/changes", access: PUBLIC_ACCESS },
      { method: "POST", url: "/api/events", access: PUBLIC_ACCESS },
      { method: "POST", url: "/api/pin-code-redemptions", access: PUBLIC_ACCESS },
      { method: "POST", url: "/api/sign-in-lookups", access: PUBLIC_ACCESS },
      { method: "POST", url: "/api/devices/current/tokens", access: PUBLIC_ACCESS },
      { method: "POST", url: "/api/first-pin-codes", access: PUBLIC_ACCESS },
      { method: "HEAD", url: "/*", access: PUBLIC_ACCESS },
      { method: "GET", url: "/*", access: PUBLIC_ACCESS },
    ]);
  });

  it("registers every route but the static files under the API prefix, so no screen address can reach one", async () => {
    const app = productionWiredApp();
    await app.ready();

    const outsideApi = app
      .routeAccessInventory()
      .filter((route) => route.url !== "/*" && !route.url.startsWith("/api/"));

    expect(outsideApi).toEqual([]);
  });

  it("never registers a route with no declared access", async () => {
    const app = productionWiredApp();
    await app.ready();

    for (const route of app.routeAccessInventory()) {
      expect(route.access, `${route.method} ${route.url} has no declared access`).toBeDefined();
    }
  });
});

describe("deleting a product", () => {
  it("has no route in the fully wired app", async () => {
    const app = productionWiredApp();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/products/00000000-0000-0000-0000-000000000000",
      headers: { origin: BACKOFFICE_ORIGIN },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("the former session and passkey read paths", () => {
  async function signedInAdministratorWithPasskey(): Promise<string> {
    const db = testDatabase.db;
    const [administratorRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true));
    if (!administratorRole) {
      throw new Error("test setup: no Administrator role seeded");
    }
    const [user] = await db
      .insert(users)
      .values({
        firstName: "Ada Lovelace",
        email: "ada@example.com",
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    await db.insert(userRoles).values({ userId: user.id, roleId: administratorRole.id });
    await db.insert(passkeys).values({
      userId: user.id,
      credentialId: "credential-laptop",
      publicKey: "cHVibGljLWtleQ",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      name: "Notebook",
    });
    const rawSessionId = generateSessionId();
    await db.insert(sessions).values({
      userId: user.id,
      sessionIdHash: hashSessionId(rawSessionId),
      createdAt: APP_CLOCK,
      lastSeenAt: APP_CLOCK,
    });
    return rawSessionId;
  }

  function get(app: ReturnType<typeof buildApp>, url: string, rawSessionId: string) {
    return app.inject({
      method: "GET",
      url,
      headers: { origin: BACKOFFICE_ORIGIN, cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` },
    });
  }

  it("no longer returns the session to an Administrator who can read it at its current path", async () => {
    const app = productionWiredApp();
    const rawSessionId = await signedInAdministratorWithPasskey();

    const current = await get(app, "/api/sessions/current", rawSessionId);
    const former = await get(app, "/api/users/session", rawSessionId);

    expect(openSessionSchema.safeParse(current.json()).success).toBe(true);
    expect(current.body).toContain("Ada Lovelace");
    expect(openSessionSchema.safeParse(former.json()).success).toBe(false);
    expect(former.body).not.toContain("Ada Lovelace");
  });

  it("no longer returns the passkeys to an Administrator who can list them at their current path", async () => {
    const app = productionWiredApp();
    const rawSessionId = await signedInAdministratorWithPasskey();

    const current = await get(app, "/api/account/passkeys", rawSessionId);
    const former = await get(app, "/api/users/passkeys", rawSessionId);

    expect(passkeyListSchema.safeParse(current.json()).success).toBe(true);
    expect(current.body).toContain("Notebook");
    expect(passkeyListSchema.safeParse(former.json()).success).toBe(false);
    expect(former.body).not.toContain("Notebook");
  });
});

describe("every route enforces the access it declares", () => {
  const ENDED_BEFORE = new Date("2020-01-01T00:00:00.000Z");

  function routesDeclaring(app: ReturnType<typeof buildApp>, levels: RouteAccess["level"][]) {
    const routes = app
      .routeAccessInventory()
      .filter((route) => route.access !== undefined && levels.includes(route.access.level));
    expect(routes.length, `no route declares ${levels.join(" or ")}`).toBeGreaterThan(0);
    return routes;
  }

  function resolvedPath(url: string): string {
    return url.replace(/:\w+/g, "00000000-0000-0000-0000-000000000000").replace(/\*$/, "help");
  }

  function send(app: ReturnType<typeof buildApp>, route: RouteAccessEntry, rawSessionId?: string) {
    return app.inject({
      method: route.method as "GET" | "HEAD" | "POST",
      url: resolvedPath(route.url),
      headers: {
        origin: BACKOFFICE_ORIGIN,
        ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
      },
    });
  }

  function codeOf(body: string): unknown {
    try {
      return (JSON.parse(body) as { code?: unknown }).code;
    } catch {
      return undefined;
    }
  }

  async function signedInWithRole(permissionKeys: readonly string[]): Promise<string> {
    const db = testDatabase.db;
    const [role] = await db
      .insert(roles)
      .values({ name: `Rol ${generateSessionId()}`, isAdministrator: false })
      .returning({ id: roles.id });
    if (!role) {
      throw new Error("test setup: seeding the role returned no row");
    }
    if (permissionKeys.length > 0) {
      await db
        .insert(rolePermissions)
        .values(permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
    }
    const [user] = await db
      .insert(users)
      .values({
        firstName: "Grace Hopper",
        email: `${generateSessionId()}@example.com`,
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
    const rawSessionId = generateSessionId();
    await db.insert(sessions).values({
      userId: user.id,
      sessionIdHash: hashSessionId(rawSessionId),
      createdAt: APP_CLOCK,
      lastSeenAt: APP_CLOCK,
    });
    return rawSessionId;
  }

  it("sweeps every access level a route declares", async () => {
    const app = productionWiredApp();
    await app.ready();

    const declaredLevels = new Set(app.routeAccessInventory().map((route) => route.access?.level));

    expect(declaredLevels).toEqual(
      new Set([
        "public",
        "open_session",
        "open_session_peek",
        "session_cookie",
        "capability",
        "record",
      ]),
    );
  });

  it("lets every public route through without a session", async () => {
    const app = productionWiredApp();
    await app.ready();

    for (const route of routesDeclaring(app, ["public"])) {
      const response = await send(app, route);

      expect(
        ["unauthenticated", "forbidden"].includes(String(codeOf(response.body))),
        `${route.method} ${route.url} responded ${response.statusCode}, body: ${response.body}`,
      ).toBe(false);
    }
  });

  it("answers 401 unauthenticated on every session route without a session", async () => {
    const app = productionWiredApp();
    await app.ready();

    for (const route of routesDeclaring(app, [
      "open_session",
      "open_session_peek",
      "session_cookie",
      "capability",
      "record",
    ])) {
      const response = await send(app, route);

      expect(
        response.statusCode,
        `${route.method} ${route.url} responded ${response.statusCode}, body: ${response.body}`,
      ).toBe(401);
      expect(response.json()).toMatchObject({ code: "unauthenticated" });
    }
  });

  it("answers 401 unauthenticated on every open-session route to an already ended session", async () => {
    const app = productionWiredApp();
    await app.ready();

    for (const route of routesDeclaring(app, ["open_session", "open_session_peek", "record"])) {
      const rawSessionId = await signedInWithRole([]);
      await testDatabase.db
        .update(sessions)
        .set({ createdAt: ENDED_BEFORE, lastSeenAt: ENDED_BEFORE })
        .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));

      const response = await send(app, route, rawSessionId);

      expect(
        response.statusCode,
        `${route.method} ${route.url} responded ${response.statusCode}, body: ${response.body}`,
      ).toBe(401);
    }
  });

  it("answers 403 forbidden on every capability route to a user missing every permission of its capability", async () => {
    const app = productionWiredApp();
    await app.ready();

    for (const route of routesDeclaring(app, ["capability"])) {
      const access = route.access as Extract<RouteAccess, { level: "capability" }>;
      const capabilityPermissions: readonly PermissionKey[] =
        CAPABILITY_PERMISSIONS[access.capability];
      const rawSessionId = await signedInWithRole(
        PERMISSION_KEYS.filter((key) => !capabilityPermissions.includes(key)),
      );

      const response = await send(app, route, rawSessionId);

      expect(
        response.statusCode,
        `${route.method} ${route.url} responded ${response.statusCode}, body: ${response.body}`,
      ).toBe(403);
      expect(response.json()).toMatchObject({ code: "forbidden" });
    }
  });

  it("answers 403 forbidden on every record route to a user without permissions aiming at another person's record", async () => {
    const app = productionWiredApp();
    await app.ready();

    for (const route of routesDeclaring(app, ["record"])) {
      const rawSessionId = await signedInWithRole([]);

      const response = await send(app, route, rawSessionId);

      expect(
        response.statusCode,
        `${route.method} ${route.url} responded ${response.statusCode}, body: ${response.body}`,
      ).toBe(403);
      expect(response.json()).toMatchObject({ code: "forbidden" });
    }
  });
});
