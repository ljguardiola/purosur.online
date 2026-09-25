import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  AUTHORIZATION_REQUIRED_RESPONSE,
  hasValidPasskeyAuthorization,
  PASSKEY_AUTHORIZATION_WINDOW_MS,
  requirePasskeyAuthorization,
} from "./passkey-authorization-guard.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

describe("hasValidPasskeyAuthorization", () => {
  it("is false when the session was never authorized", () => {
    expect(hasValidPasskeyAuthorization({ passkeyAuthorizedAt: null }, NOON)).toBe(false);
  });

  it("is true exactly at the 5-minute boundary", () => {
    const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS);

    expect(hasValidPasskeyAuthorization({ passkeyAuthorizedAt: authorizedAt }, NOON)).toBe(true);
  });

  it("is false one millisecond past the 5-minute boundary", () => {
    const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1);

    expect(hasValidPasskeyAuthorization({ passkeyAuthorizedAt: authorizedAt }, NOON)).toBe(false);
  });

  it("is true for an authorization made moments ago", () => {
    const authorizedAt = new Date(NOON.getTime() - 1000);

    expect(hasValidPasskeyAuthorization({ passkeyAuthorizedAt: authorizedAt }, NOON)).toBe(true);
  });
});

describe("requirePasskeyAuthorization", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  function buildApp(passkeyAuthorizedAt: Date | null): FastifyInstance {
    app = Fastify();
    app.get("/guarded", async (_request, reply) => {
      const allowed = await requirePasskeyAuthorization({ passkeyAuthorizedAt }, reply, NOON);
      if (!allowed) {
        return;
      }
      await reply.code(200).send({ ok: true });
    });
    return app;
  }

  it("answers 401 authorization_required and blocks the action when there is no valid authorization", async () => {
    const built = buildApp(null);

    const response = await built.inject({ method: "GET", url: "/guarded" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(AUTHORIZATION_REQUIRED_RESPONSE);
  });

  it("lets the action run when the authorization is within the window", async () => {
    const built = buildApp(new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS));

    const response = await built.inject({ method: "GET", url: "/guarded" });

    expect(response.statusCode).toBe(200);
  });

  it("blocks the action when the authorization is one second past the window", async () => {
    const built = buildApp(new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000));

    const response = await built.inject({ method: "GET", url: "/guarded" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(AUTHORIZATION_REQUIRED_RESPONSE);
  });
});
