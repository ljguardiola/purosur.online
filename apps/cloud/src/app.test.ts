import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";

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

    const response = await app.inject({ method: "GET", url: "/ayuda/getting_started" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("<!doctype html><title>backoffice</title>");
  });

  it("still serves /health normally instead of falling back to index.html", async () => {
    const app = buildApp({ version: "abc1234", staticDir: backofficeBuild() });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "abc1234" });
  });

  it("does not fall back for a non-GET request to an unmatched path", async () => {
    const app = buildApp({ version: "abc1234", staticDir: backofficeBuild() });

    const response = await app.inject({ method: "POST", url: "/ayuda/getting_started" });

    expect(response.statusCode).toBe(404);
  });

  it("keeps the plain 404 behavior when no staticDir is configured", async () => {
    const app = buildApp({ version: "abc1234" });

    const response = await app.inject({ method: "GET", url: "/ayuda/getting_started" });

    expect(response.statusCode).toBe(404);
  });
});
