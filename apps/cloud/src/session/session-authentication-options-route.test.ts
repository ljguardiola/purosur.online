import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { signInChallenges } from "../db/schema.js";
import { registerSessionAuthenticationOptionsRoute } from "./session-authentication-options-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();

  app = Fastify();
  registerSessionAuthenticationOptionsRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
});

afterEach(async () => {
  await app.close();
});

function post(headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/users/session/authentication-options",
    headers: { origin: BACKOFFICE_ORIGIN, ...headers },
  });
}

describe("POST /users/session/authentication-options", () => {
  it("returns discoverable-credential request options for the backoffice's own RP", async () => {
    const response = await post();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.passkey_authentication_options).toMatchObject({
      rpId: "staging.purosur.online",
      userVerification: "required",
      allowCredentials: [],
    });
    expect(typeof body.passkey_authentication_options.challenge).toBe("string");
  });

  it("stores the returned challenge so it can later be redeemed", async () => {
    const response = await post();

    const rows = await db.select().from(signInChallenges);
    expect(rows.map((row) => row.challenge)).toEqual([
      response.json().passkey_authentication_options.challenge,
    ]);
  });

  it("issues a fresh challenge on every call", async () => {
    const first = await post();
    const second = await post();

    expect(first.json().passkey_authentication_options.challenge).not.toBe(
      second.json().passkey_authentication_options.challenge,
    );
  });

  it("does not open a session", async () => {
    const response = await post();

    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects a missing Origin header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/users/session/authentication-options",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects an Origin that does not match the backoffice's own origin", async () => {
    const response = await post({ origin: "https://evil.example.com" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });
});
