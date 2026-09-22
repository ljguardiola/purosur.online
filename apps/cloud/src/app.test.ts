import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";

const MIGRATIONS_FOLDER = new URL("../migrations", import.meta.url).pathname;

describe("GET /health", () => {
  it("responds 200 with status ok and the given version", async () => {
    const app = buildApp({ version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "abc1234" });
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
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const enqueued: string[] = [];

    const app = buildApp({
      version: "abc1234",
      recovery: {
        db,
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

    await client.close();
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
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const app = buildApp({
      version: "abc1234",
      recovery: {
        db,
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
    // own token-classification error instead of Fastify's generic 404 for an unregistered route.
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "recovery_token_invalid" });

    await client.close();
  });
});
