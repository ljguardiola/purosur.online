import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backofficeOriginGuard } from "./backoffice-origin.js";

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
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

function post(headers: Record<string, string>) {
  return app.inject({ method: "POST", url: "/test-only/backoffice-only", headers });
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
