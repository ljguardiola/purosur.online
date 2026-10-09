import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backofficeOriginGuard, sameOriginGuard } from "./backoffice-origin.js";

const BACKOFFICE_ORIGIN = "https://backoffice.example.com";

let app: FastifyInstance;
let handlerRuns: number;

beforeEach(async () => {
  handlerRuns = 0;
  app = Fastify();
  app.post(
    "/test-only/backoffice-only",
    { preHandler: backofficeOriginGuard(BACKOFFICE_ORIGIN) },
    async () => {
      handlerRuns += 1;
      return { ok: true };
    },
  );
  app.get(
    "/test-only/same-origin-only",
    { preHandler: sameOriginGuard(BACKOFFICE_ORIGIN) },
    async () => {
      handlerRuns += 1;
      return { ok: true };
    },
  );
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

function post(headers: Record<string, string>) {
  return app.inject({ method: "POST", url: "/test-only/backoffice-only", headers });
}

function get(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/test-only/same-origin-only", headers });
}

describe("the backoffice origin guard", () => {
  it("lets a request from the backoffice's own origin reach the handler", async () => {
    const response = await post({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(200);
    expect(handlerRuns).toBe(1);
  });

  it("rejects a request from another origin with 403 origin_rejected, never running the handler", async () => {
    const response = await post({ origin: "https://evil.example.com" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "origin_rejected",
      message: "the request's Origin does not match the backoffice's own origin",
    });
    expect(handlerRuns).toBe(0);
  });

  it("rejects a request with no Origin the same way", async () => {
    const response = await post({});

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "origin_rejected",
      message: "the request's Origin does not match the backoffice's own origin",
    });
    expect(handlerRuns).toBe(0);
  });
});

describe("the same-origin guard", () => {
  it("lets a request from the backoffice's own origin reach the handler", async () => {
    const response = await get({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(200);
    expect(handlerRuns).toBe(1);
  });

  it("lets a request with no Origin reach the handler when the browser marks it same-origin", async () => {
    const response = await get({ "sec-fetch-site": "same-origin" });

    expect(response.statusCode).toBe(200);
    expect(handlerRuns).toBe(1);
  });

  it("lets a request with neither Origin nor Sec-Fetch-Site reach the handler", async () => {
    const response = await get({});

    expect(response.statusCode).toBe(200);
    expect(handlerRuns).toBe(1);
  });

  it("rejects a request from another origin with 403 origin_rejected, never running the handler", async () => {
    const response = await get({ origin: "https://evil.example.com" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "origin_rejected",
      message: "the request's Origin does not match the backoffice's own origin",
    });
    expect(handlerRuns).toBe(0);
  });

  it.each(["cross-site", "same-site", "none"])(
    "rejects a request the browser marks %s with 403 origin_rejected, never running the handler",
    async (fetchSite) => {
      const response = await get({ "sec-fetch-site": fetchSite });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        code: "origin_rejected",
        message: "the request did not come from the backoffice itself",
      });
      expect(handlerRuns).toBe(0);
    },
  );

  it("rejects a request from another origin the browser marks same-origin as coming from another origin", async () => {
    const response = await get({
      origin: "https://evil.example.com",
      "sec-fetch-site": "same-origin",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "origin_rejected",
      message: "the request's Origin does not match the backoffice's own origin",
    });
    expect(handlerRuns).toBe(0);
  });

  it("rejects a request from the backoffice's origin the browser marks cross-site", async () => {
    const response = await get({ origin: BACKOFFICE_ORIGIN, "sec-fetch-site": "cross-site" });

    expect(response.statusCode).toBe(403);
    expect(handlerRuns).toBe(0);
  });
});
