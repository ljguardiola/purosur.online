import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp as buildRealApp } from "./app.js";
import { buildTestDatabase, type TestDatabase } from "./db/build-test-database.js";
import { rolePermissions, roles, sessions, userRoles, users } from "./db/schema.js";
import { PERMISSION_KEYS } from "./roles/permission-catalog.js";
import {
  ADMINISTRATOR_ACCESS,
  OPEN_SESSION_ACCESS,
  OPEN_SESSION_PEEK_ACCESS,
  PUBLIC_ACCESS,
  permissionAccess,
  type RouteAccess,
  type RouteAccessEntry,
  routeSessionSource,
  SESSION_COOKIE_ACCESS,
} from "./session/route-access.js";
import { SESSION_COOKIE_NAME } from "./session/session-cookie.js";
import { generateSessionId, hashSessionId } from "./session/session-id.js";
import {
  buildTestApp as buildApp,
  TEST_EDGE_ORIGIN_SECRET,
} from "./test-support/build-test-app.js";
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

describe("GET /health", () => {
  it("responds 200 with status ok and the given version", async () => {
    const app = buildApp({ version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "abc1234" });
  });
});

describe("the edge origin guard", () => {
  it("refuses a request with no edge secret header with 403 direct_access_rejected", async () => {
    const app = buildRealApp({ version: "abc1234", edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET });

    const response = await app.inject({ method: "GET", url: "/some-route" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "direct_access_rejected",
      message: "this request did not come through the edge",
    });
  });

  it("refuses a request whose edge secret header does not match", async () => {
    const app = buildRealApp({ version: "abc1234", edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET });

    const response = await app.inject({
      method: "GET",
      url: "/some-route",
      headers: { "x-edge-origin-secret": "not-the-real-secret" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("lets a request with the correct edge secret header reach routing", async () => {
    const app = buildRealApp({ version: "abc1234", edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET });

    const response = await app.inject({
      method: "GET",
      url: "/some-route",
      headers: { "x-edge-origin-secret": TEST_EDGE_ORIGIN_SECRET },
    });

    // No route is registered at /some-route: reaching Fastify's own 404 (instead of the guard's
    // 403) proves the request passed the guard and reached routing.
    expect(response.statusCode).toBe(404);
  });

  it("exempts GET /health even with no edge secret header", async () => {
    const app = buildRealApp({ version: "abc1234", edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
  });

  it("exempts GET /health with a query string even with no edge secret header", async () => {
    const app = buildRealApp({ version: "abc1234", edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET });

    const response = await app.inject({ method: "GET", url: "/health?probe=1" });

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

    it("exempts GET /health with no edge secret header", async () => {
      const response = await getRawPath("/health");

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: "ok", version: "abc1234" });
    });

    it.each(["/./health", "/x/../health", "/%2e%2e/health", "/health/"])(
      "refuses GET %s with no edge secret header because it is not the /health route",
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

describe("Sentry error handler wiring", () => {
  it("wires the provided setupFastifyErrorHandler function onto the built app", () => {
    const setupFastifyErrorHandler = vi.fn();

    const app = buildApp({ version: "abc1234", setupFastifyErrorHandler });

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

    const app = buildApp({ version: "abc1234", setupFastifyErrorHandler });
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
    const app = buildApp({ version: "abc1234", staticDir: backofficeBuild() });

    const response = await app.inject({ method: "GET", url: "/assets/app.js" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("console.log('app');");
  });

  it("falls back to index.html for a GET to a path that matches no static file or route", async () => {
    const app = buildApp({ version: "abc1234", staticDir: backofficeBuild() });

    const response = await app.inject({ method: "GET", url: "/help/getting_started" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("<!doctype html><title>backoffice</title>");
  });

  it("still serves /health normally instead of falling back to index.html", async () => {
    const app = buildApp({ version: "abc1234", staticDir: backofficeBuild() });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "abc1234" });
  });

  it("falls back to index.html for a HEAD to a client route, same as a GET", async () => {
    const app = buildApp({ version: "abc1234", staticDir: backofficeBuild() });

    const response = await app.inject({ method: "HEAD", url: "/help/getting_started" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it.each(["/assets/old-hash.js", "/robots.txt", "/help/getting_started.png"])(
    "answers 404 instead of index.html for a missing file like %s",
    async (url) => {
      const app = buildApp({ version: "abc1234", staticDir: backofficeBuild() });

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
      const app = buildApp({ version: "abc1234", staticDir: backofficeBuild() });

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

  it("lets browsers keep a hashed asset for a year without revalidating", async () => {
    const app = buildApp({ version: "abc1234", staticDir: backofficeBuild() });

    const response = await app.inject({ method: "GET", url: "/assets/app.js" });

    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it.each(["/", "/index.html", "/help/getting_started"])(
    "makes browsers revalidate the page served for %s",
    async (url) => {
      const app = buildApp({ version: "abc1234", staticDir: backofficeBuild() });

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
      const app = buildApp({ version: "abc1234", staticDir: dir });

      const response = await app.inject({ method: "GET", url: `/${file}` });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain(contentType);
      expect(response.body).toBe("isotype-bytes");
    },
  );

  it("does not fall back for a non-GET request to an unmatched path", async () => {
    const app = buildApp({ version: "abc1234", staticDir: backofficeBuild() });

    const response = await app.inject({ method: "POST", url: "/help/getting_started" });

    expect(response.statusCode).toBe(404);
  });

  it("keeps the plain 404 behavior when no staticDir is configured", async () => {
    const app = buildApp({ version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/help/getting_started" });

    expect(response.statusCode).toBe(404);
  });
});

describe("wiring the recovery routes", () => {
  it("does not register POST /users/recovery/request when no recovery option is given", async () => {
    const app = buildApp({ version: "abc1234" });

    const response = await app.inject({
      method: "POST",
      url: "/users/recovery/request",
      payload: { email: "ada@example.com" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("registers POST /users/recovery/request when a recovery option is given", async () => {
    const enqueued: string[] = [];

    const app = buildApp({
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
      url: "/users/recovery/request",
      headers: { origin: "https://staging.purosur.online", "x-real-ip": "203.0.113.10" },
      payload: { email: "ada@example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(enqueued).toEqual(["ada@example.com"]);
  });

  it("does not register the redemption routes when no recovery option is given", async () => {
    const app = buildApp({ version: "abc1234" });

    const optionsResponse = await app.inject({
      method: "POST",
      url: "/users/recovery/registration-options",
      payload: { recovery_token: "a-raw-token" },
    });
    const redeemResponse = await app.inject({
      method: "POST",
      url: "/users/recovery/redeem",
      payload: { recovery_token: "a-raw-token" },
    });

    expect(optionsResponse.statusCode).toBe(404);
    expect(redeemResponse.statusCode).toBe(404);
  });

  it("registers the redemption routes when a recovery option is given", async () => {
    const app = buildApp({
      version: "abc1234",
      recovery: {
        db: testDatabase.db,
        jobQueue: { async enqueueRecoveryRequest() {} },
        backofficeOrigin: "https://staging.purosur.online",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/users/recovery/registration-options",
      headers: { origin: "https://staging.purosur.online", "x-real-ip": "203.0.113.10" },
      payload: { recovery_token: "an-unknown-raw-token" },
    });

    // An unrecognized token still proves the route is wired: it reaches the redemption handler's
    // own token-classification error body instead of Fastify's generic not-found response for an
    // unregistered route.
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "recovery_token_invalid" });
  });
});

describe("wiring the session routes", () => {
  it("does not register GET /users/session, its status route, POST /users/session/sign-out, or the authorization pair when no session option is given", async () => {
    const app = buildApp({ version: "abc1234" });

    const readResponse = await app.inject({ method: "GET", url: "/users/session" });
    const statusResponse = await app.inject({ method: "GET", url: "/users/session/status" });
    const signOutResponse = await app.inject({
      method: "POST",
      url: "/users/session/sign-out",
      headers: { origin: "https://staging.purosur.online" },
    });
    const authorizationOptionsResponse = await app.inject({
      method: "POST",
      url: "/users/session/authorization-options",
      headers: { origin: "https://staging.purosur.online" },
    });
    const authorizationResponse = await app.inject({
      method: "POST",
      url: "/users/session/authorization",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(readResponse.statusCode).toBe(404);
    expect(statusResponse.statusCode).toBe(404);
    expect(signOutResponse.statusCode).toBe(404);
    expect(authorizationOptionsResponse.statusCode).toBe(404);
    expect(authorizationResponse.statusCode).toBe(404);
  });

  it("registers GET /users/session, its status route, POST /users/session/sign-out, and the authorization pair when a session option is given", async () => {
    const app = buildApp({
      version: "abc1234",
      session: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const readResponse = await app.inject({ method: "GET", url: "/users/session" });
    const statusResponse = await app.inject({ method: "GET", url: "/users/session/status" });
    const signOutResponse = await app.inject({
      method: "POST",
      url: "/users/session/sign-out",
      headers: { origin: "https://staging.purosur.online" },
    });
    const authorizationOptionsResponse = await app.inject({
      method: "POST",
      url: "/users/session/authorization-options",
      headers: { origin: "https://staging.purosur.online" },
    });
    const authorizationResponse = await app.inject({
      method: "POST",
      url: "/users/session/authorization",
      headers: { origin: "https://staging.purosur.online" },
    });

    // No session cookie was sent in any case, so every one reaches its own route handler's
    // 401 instead of Fastify's generic not-found response for an unregistered route.
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
    const app = buildApp({ version: "abc1234" });

    const list = await app.inject({ method: "GET", url: "/users" });
    const read = await app.inject({
      method: "GET",
      url: "/users/00000000-0000-0000-0000-000000000000",
    });
    const create = await app.inject({
      method: "POST",
      url: "/users",
      headers: { origin: "https://staging.purosur.online" },
    });
    const emailChange = await app.inject({
      method: "POST",
      url: "/users/00000000-0000-0000-0000-000000000000/email",
      headers: { origin: "https://staging.purosur.online" },
    });
    const userPasskeys = await app.inject({
      method: "GET",
      url: "/users/00000000-0000-0000-0000-000000000000/passkeys",
    });
    const userPasskeyRemove = await app.inject({
      method: "POST",
      url: "/users/00000000-0000-0000-0000-000000000000/passkeys/00000000-0000-0000-0000-000000000000/remove",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(404);
    expect(read.statusCode).toBe(404);
    expect(create.statusCode).toBe(404);
    expect(emailChange.statusCode).toBe(404);
    expect(userPasskeys.statusCode).toBe(404);
    expect(userPasskeyRemove.statusCode).toBe(404);
  });

  it("registers the users routes when a users option is given", async () => {
    const app = buildApp({
      version: "abc1234",
      users: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const list = await app.inject({ method: "GET", url: "/users" });
    const read = await app.inject({
      method: "GET",
      url: "/users/00000000-0000-0000-0000-000000000000",
    });
    const create = await app.inject({
      method: "POST",
      url: "/users",
      headers: { origin: "https://staging.purosur.online" },
    });
    const emailChange = await app.inject({
      method: "POST",
      url: "/users/00000000-0000-0000-0000-000000000000/email",
      headers: { origin: "https://staging.purosur.online" },
    });
    const userPasskeys = await app.inject({
      method: "GET",
      url: "/users/00000000-0000-0000-0000-000000000000/passkeys",
    });
    const userPasskeyRemove = await app.inject({
      method: "POST",
      url: "/users/00000000-0000-0000-0000-000000000000/passkeys/00000000-0000-0000-0000-000000000000/remove",
      headers: { origin: "https://staging.purosur.online" },
    });

    // No session cookie was sent in any case, so each reaches its own route handler's 401
    // instead of Fastify's generic not-found response for an unregistered route.
    expect(list.statusCode).toBe(401);
    expect(read.statusCode).toBe(401);
    expect(create.statusCode).toBe(401);
    expect(emailChange.statusCode).toBe(401);
    expect(userPasskeys.statusCode).toBe(401);
    expect(userPasskeyRemove.statusCode).toBe(401);
  });
});

describe("wiring the roles routes", () => {
  it("does not register the roles routes when no roles option is given", async () => {
    const app = buildApp({ version: "abc1234" });

    const list = await app.inject({ method: "GET", url: "/roles" });
    const read = await app.inject({
      method: "GET",
      url: "/roles/00000000-0000-0000-0000-000000000000",
    });
    const create = await app.inject({
      method: "POST",
      url: "/roles",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "POST",
      url: "/roles/00000000-0000-0000-0000-000000000000/edit",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(404);
    expect(read.statusCode).toBe(404);
    expect(create.statusCode).toBe(404);
    expect(edit.statusCode).toBe(404);
  });

  it("registers the roles routes when a roles option is given", async () => {
    const app = buildApp({
      version: "abc1234",
      roles: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const list = await app.inject({ method: "GET", url: "/roles" });
    const read = await app.inject({
      method: "GET",
      url: "/roles/00000000-0000-0000-0000-000000000000",
      headers: { origin: "https://staging.purosur.online" },
    });
    const create = await app.inject({
      method: "POST",
      url: "/roles",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "POST",
      url: "/roles/00000000-0000-0000-0000-000000000000/edit",
      headers: { origin: "https://staging.purosur.online" },
    });

    // No session cookie was sent in any case, so each reaches its own route handler's 401 instead
    // of Fastify's generic not-found response for an unregistered route.
    expect(list.statusCode).toBe(401);
    expect(read.statusCode).toBe(401);
    expect(create.statusCode).toBe(401);
    expect(edit.statusCode).toBe(401);
  });
});

describe("wiring the categories routes", () => {
  it("does not register the categories routes when no categories option is given", async () => {
    const app = buildApp({ version: "abc1234" });

    const list = await app.inject({ method: "GET", url: "/categories" });
    const create = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "POST",
      url: "/categories/00000000-0000-0000-0000-000000000000/edit",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(404);
    expect(create.statusCode).toBe(404);
    expect(edit.statusCode).toBe(404);
  });

  it("registers the categories routes when a categories option is given", async () => {
    const app = buildApp({
      version: "abc1234",
      categories: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const list = await app.inject({ method: "GET", url: "/categories" });
    const create = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "POST",
      url: "/categories/00000000-0000-0000-0000-000000000000/edit",
      headers: { origin: "https://staging.purosur.online" },
    });

    // No session cookie was sent in any case, so each reaches its own route handler's 401 instead
    // of Fastify's generic not-found response for an unregistered route.
    expect(list.statusCode).toBe(401);
    expect(create.statusCode).toBe(401);
    expect(edit.statusCode).toBe(401);
  });
});

describe("wiring the products routes", () => {
  it("does not register the products routes when no products option is given", async () => {
    const app = buildApp({ version: "abc1234" });

    const list = await app.inject({ method: "GET", url: "/products" });
    const create = await app.inject({
      method: "POST",
      url: "/products",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "POST",
      url: "/products/00000000-0000-0000-0000-000000000000/edit",
      headers: { origin: "https://staging.purosur.online" },
    });
    const internalBarcode = await app.inject({
      method: "POST",
      url: "/products/internal-barcode",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(list.statusCode).toBe(404);
    expect(create.statusCode).toBe(404);
    expect(edit.statusCode).toBe(404);
    expect(internalBarcode.statusCode).toBe(404);
  });

  it("registers the products routes when a products option is given", async () => {
    const app = buildApp({
      version: "abc1234",
      products: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const list = await app.inject({ method: "GET", url: "/products" });
    const create = await app.inject({
      method: "POST",
      url: "/products",
      headers: { origin: "https://staging.purosur.online" },
    });
    const edit = await app.inject({
      method: "POST",
      url: "/products/00000000-0000-0000-0000-000000000000/edit",
      headers: { origin: "https://staging.purosur.online" },
    });
    const internalBarcode = await app.inject({
      method: "POST",
      url: "/products/internal-barcode",
      headers: { origin: "https://staging.purosur.online" },
    });

    // No session cookie was sent in any case, so each reaches its own route handler's 401 instead
    // of Fastify's generic not-found response for an unregistered route.
    expect(list.statusCode).toBe(401);
    expect(create.statusCode).toBe(401);
    expect(edit.statusCode).toBe(401);
    expect(internalBarcode.statusCode).toBe(401);
  });
});

describe("wiring the branch settings routes", () => {
  it("does not register GET /branch-settings when no branchSettings option is given", async () => {
    const app = buildApp({ version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/branch-settings" });

    expect(response.statusCode).toBe(404);
  });

  it("registers GET /branch-settings when a branchSettings option is given", async () => {
    const app = buildApp({
      version: "abc1234",
      branchSettings: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/branch-settings",
      headers: { origin: "https://staging.purosur.online" },
    });

    // No session cookie was sent, so this reaches the route handler's own 401 instead of
    // Fastify's generic not-found response for an unregistered route.
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("does not register PUT /branch-settings when no branchSettings option is given", async () => {
    const app = buildApp({ version: "abc1234" });

    const response = await app.inject({ method: "PUT", url: "/branch-settings" });

    expect(response.statusCode).toBe(404);
  });

  it("registers PUT /branch-settings when a branchSettings option is given", async () => {
    const app = buildApp({
      version: "abc1234",
      branchSettings: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/branch-settings",
      headers: { origin: "https://staging.purosur.online" },
    });

    // No session cookie was sent, so this reaches the route handler's own 401 instead of
    // Fastify's generic not-found response for an unregistered route.
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });
});

describe("wiring the passkeys routes", () => {
  it("does not register GET /users/passkeys when no passkeys option is given", async () => {
    const app = buildApp({ version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/users/passkeys" });

    expect(response.statusCode).toBe(404);
  });

  it("registers GET /users/passkeys when a passkeys option is given", async () => {
    const app = buildApp({
      version: "abc1234",
      passkeys: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const response = await app.inject({ method: "GET", url: "/users/passkeys" });

    // No session cookie was sent, so this reaches the route handler's own 401 instead of
    // Fastify's generic not-found response for an unregistered route.
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("does not register the registration or removal routes when no passkeys option is given", async () => {
    const app = buildApp({ version: "abc1234" });

    const registrationOptions = await app.inject({
      method: "POST",
      url: "/users/passkeys/registration-options",
      headers: { origin: "https://staging.purosur.online" },
    });
    const remove = await app.inject({
      method: "POST",
      url: "/users/passkeys/00000000-0000-0000-0000-000000000000/remove",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(registrationOptions.statusCode).toBe(404);
    expect(remove.statusCode).toBe(404);
  });

  it("registers the registration and removal routes when a passkeys option is given", async () => {
    const app = buildApp({
      version: "abc1234",
      passkeys: { db: testDatabase.db, backofficeOrigin: "https://staging.purosur.online" },
    });

    const registrationOptions = await app.inject({
      method: "POST",
      url: "/users/passkeys/registration-options",
      headers: { origin: "https://staging.purosur.online" },
    });
    const remove = await app.inject({
      method: "POST",
      url: "/users/passkeys/00000000-0000-0000-0000-000000000000/remove",
      headers: { origin: "https://staging.purosur.online" },
    });

    // No session cookie was sent in any case, so each reaches its own route handler's 401
    // instead of Fastify's generic not-found response for an unregistered route.
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

/** Wired exactly as production is, including the backoffice's static build. */
function fullyWiredApp() {
  const staticDir = mkdtempSync(join(tmpdir(), "cloud-static-"));
  productionStaticDirs.push(staticDir);
  writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>backoffice</title>");
  return buildApp({
    version: "abc1234",
    staticDir,
    recovery: {
      db: testDatabase.db,
      jobQueue: { async enqueueRecoveryRequest() {} },
      backofficeOrigin: BACKOFFICE_ORIGIN,
    },
    session: { db: testDatabase.db, backofficeOrigin: BACKOFFICE_ORIGIN },
    passkeys: { db: testDatabase.db, backofficeOrigin: BACKOFFICE_ORIGIN },
    users: { db: testDatabase.db, backofficeOrigin: BACKOFFICE_ORIGIN },
    roles: { db: testDatabase.db, backofficeOrigin: BACKOFFICE_ORIGIN },
    branchSettings: { db: testDatabase.db, backofficeOrigin: BACKOFFICE_ORIGIN },
    categories: { db: testDatabase.db, backofficeOrigin: BACKOFFICE_ORIGIN },
    products: { db: testDatabase.db, backofficeOrigin: BACKOFFICE_ORIGIN },
  });
}

describe("the route access inventory", () => {
  it("declares exactly one access level for every registered route", async () => {
    const app = fullyWiredApp();
    await app.ready();

    expect(app.routeAccessInventory()).toEqual([
      { method: "GET", url: "/health", access: PUBLIC_ACCESS },
      { method: "POST", url: "/users/recovery/request", access: PUBLIC_ACCESS },
      { method: "POST", url: "/users/recovery/registration-options", access: PUBLIC_ACCESS },
      { method: "POST", url: "/users/recovery/redeem", access: PUBLIC_ACCESS },
      { method: "POST", url: "/users/session/authentication-options", access: PUBLIC_ACCESS },
      { method: "POST", url: "/users/session/authenticate", access: PUBLIC_ACCESS },
      { method: "GET", url: "/users/session", access: OPEN_SESSION_ACCESS },
      { method: "GET", url: "/users/session/status", access: OPEN_SESSION_PEEK_ACCESS },
      { method: "POST", url: "/users/session/sign-out", access: SESSION_COOKIE_ACCESS },
      { method: "POST", url: "/users/session/authorization-options", access: OPEN_SESSION_ACCESS },
      { method: "POST", url: "/users/session/authorization", access: OPEN_SESSION_ACCESS },
      { method: "GET", url: "/users/passkeys", access: OPEN_SESSION_ACCESS },
      { method: "POST", url: "/users/passkeys/registration-options", access: OPEN_SESSION_ACCESS },
      { method: "POST", url: "/users/passkeys", access: OPEN_SESSION_ACCESS },
      { method: "POST", url: "/users/passkeys/:id/remove", access: OPEN_SESSION_ACCESS },
      { method: "GET", url: "/users", access: ADMINISTRATOR_ACCESS },
      { method: "GET", url: "/users/:id", access: ADMINISTRATOR_ACCESS },
      { method: "POST", url: "/users", access: ADMINISTRATOR_ACCESS },
      { method: "POST", url: "/users/:id/email", access: ADMINISTRATOR_ACCESS },
      { method: "GET", url: "/users/:id/passkeys", access: ADMINISTRATOR_ACCESS },
      {
        method: "POST",
        url: "/users/:id/passkeys/:passkeyId/remove",
        access: ADMINISTRATOR_ACCESS,
      },
      { method: "GET", url: "/roles", access: ADMINISTRATOR_ACCESS },
      { method: "GET", url: "/roles/:id", access: ADMINISTRATOR_ACCESS },
      { method: "POST", url: "/roles", access: ADMINISTRATOR_ACCESS },
      { method: "POST", url: "/roles/:id/edit", access: ADMINISTRATOR_ACCESS },
      {
        method: "GET",
        url: "/branch-settings",
        access: permissionAccess("configure_branch"),
      },
      {
        method: "PUT",
        url: "/branch-settings",
        access: permissionAccess("configure_branch"),
      },
      {
        method: "GET",
        url: "/categories",
        access: permissionAccess("manage_products_and_categories"),
      },
      {
        method: "POST",
        url: "/categories",
        access: permissionAccess("manage_products_and_categories"),
      },
      {
        method: "POST",
        url: "/categories/:id/edit",
        access: permissionAccess("manage_products_and_categories"),
      },
      {
        method: "GET",
        url: "/products",
        access: permissionAccess("manage_products_and_categories"),
      },
      {
        method: "POST",
        url: "/products",
        access: permissionAccess("manage_products_and_categories"),
      },
      {
        method: "POST",
        url: "/products/:id/edit",
        access: permissionAccess("manage_products_and_categories"),
      },
      {
        method: "POST",
        url: "/products/internal-barcode",
        access: permissionAccess("manage_products_and_categories"),
      },
      { method: "HEAD", url: "/*", access: PUBLIC_ACCESS },
      { method: "GET", url: "/*", access: PUBLIC_ACCESS },
    ]);
  });

  it("never registers a route with no declared access", async () => {
    const app = fullyWiredApp();
    await app.ready();

    for (const route of app.routeAccessInventory()) {
      expect(route.access, `${route.method} ${route.url} has no declared access`).toBeDefined();
    }
  });
});

describe("every route enforces the access it declares", () => {
  const ENDED_BEFORE = new Date("2020-01-01T00:00:00.000Z");

  /** The fully wired app plus a test-only route declaring a permission, since no production route needs one yet. */
  function sweptApp() {
    const app = fullyWiredApp();
    app.get(
      "/test-only/void-sale",
      {
        config: {
          access: permissionAccess("void_sale"),
          sessionSource: routeSessionSource({ db: testDatabase.db }),
        },
      },
      async (_request, reply) => {
        await reply.code(200).send({ ok: true });
      },
    );
    return app;
  }

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
      createdAt: new Date(),
      lastSeenAt: new Date(),
    });
    return rawSessionId;
  }

  it("sweeps every access level a route declares", async () => {
    const app = sweptApp();
    await app.ready();

    const declaredLevels = new Set(app.routeAccessInventory().map((route) => route.access?.level));

    expect(declaredLevels).toEqual(
      new Set([
        "public",
        "open_session",
        "open_session_peek",
        "session_cookie",
        "administrator",
        "permission",
      ]),
    );
  });

  it("lets every public route through without a session", async () => {
    const app = sweptApp();
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
    const app = sweptApp();
    await app.ready();

    for (const route of routesDeclaring(app, [
      "open_session",
      "open_session_peek",
      "session_cookie",
      "administrator",
      "permission",
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
    const app = sweptApp();
    await app.ready();

    for (const route of routesDeclaring(app, ["open_session", "open_session_peek"])) {
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

  it("answers 403 forbidden on every Administrator-only route to a non-Administrator holding every permission", async () => {
    const app = sweptApp();
    await app.ready();
    const rawSessionId = await signedInWithRole(PERMISSION_KEYS);

    for (const route of routesDeclaring(app, ["administrator"])) {
      const response = await send(app, route, rawSessionId);

      expect(
        response.statusCode,
        `${route.method} ${route.url} responded ${response.statusCode}, body: ${response.body}`,
      ).toBe(403);
      expect(response.json()).toMatchObject({ code: "forbidden" });
    }
  });

  it("answers 403 forbidden on every permission route to a user whose role lacks that permission", async () => {
    const app = sweptApp();
    await app.ready();

    for (const route of routesDeclaring(app, ["permission"])) {
      const access = route.access as Extract<RouteAccess, { level: "permission" }>;
      const rawSessionId = await signedInWithRole(
        PERMISSION_KEYS.filter((key) => key !== access.permission),
      );

      const response = await send(app, route, rawSessionId);

      expect(
        response.statusCode,
        `${route.method} ${route.url} responded ${response.statusCode}, body: ${response.body}`,
      ).toBe(403);
      expect(response.json()).toMatchObject({ code: "forbidden" });
    }
  });
});
