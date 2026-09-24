import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp as buildRealApp } from "./app.js";
import { buildTestDatabase, type TestDatabase } from "./db/build-test-database.js";
import {
  buildTestApp as buildApp,
  TEST_EDGE_ORIGIN_SECRET,
} from "./test-support/build-test-app.js";

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
    app.get("/boom", async () => {
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

  it.each(["/assets/old-hash.js", "/favicon.ico", "/help/getting_started.png"])(
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
  it("does not register GET /users/session, its status route, or POST /users/session/sign-out when no session option is given", async () => {
    const app = buildApp({ version: "abc1234" });

    const readResponse = await app.inject({ method: "GET", url: "/users/session" });
    const statusResponse = await app.inject({ method: "GET", url: "/users/session/status" });
    const signOutResponse = await app.inject({
      method: "POST",
      url: "/users/session/sign-out",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(readResponse.statusCode).toBe(404);
    expect(statusResponse.statusCode).toBe(404);
    expect(signOutResponse.statusCode).toBe(404);
  });

  it("registers GET /users/session, its status route, and POST /users/session/sign-out when a session option is given", async () => {
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

    // No session cookie was sent in either case, so all three reach their own route handler's
    // 401 instead of Fastify's generic not-found response for an unregistered route.
    expect(readResponse.statusCode).toBe(401);
    expect(readResponse.json()).toMatchObject({ code: "unauthenticated" });
    expect(statusResponse.statusCode).toBe(401);
    expect(statusResponse.json()).toMatchObject({ code: "unauthenticated" });
    expect(signOutResponse.statusCode).toBe(401);
    expect(signOutResponse.json()).toMatchObject({ code: "unauthenticated" });
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
    const removalOptions = await app.inject({
      method: "POST",
      url: "/users/passkeys/removal-options",
      headers: { origin: "https://staging.purosur.online" },
    });

    expect(registrationOptions.statusCode).toBe(404);
    expect(removalOptions.statusCode).toBe(404);
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
    const removalOptions = await app.inject({
      method: "POST",
      url: "/users/passkeys/removal-options",
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
    expect(removalOptions.statusCode).toBe(401);
    expect(remove.statusCode).toBe(401);
  });
});
