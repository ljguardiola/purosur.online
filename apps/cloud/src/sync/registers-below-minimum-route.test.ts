import { registersBelowMinimumSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deviceState } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerRegistersBelowMinimumRoute } from "./registers-below-minimum-route.js";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const TOKEN = "release-check-token-for-tests";

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
});

afterEach(async () => {
  await app.close();
});

function startApp(releaseCheckToken: string | undefined) {
  app = Fastify();
  registerRegistersBelowMinimumRoute(app, { db, releaseCheckToken });
}

function ask(minimum: string | undefined, authorization: string | null = `Bearer ${TOKEN}`) {
  return app.inject({
    method: "GET",
    url: "/sync/registers-below-minimum",
    ...(minimum === undefined ? {} : { query: { minimum } }),
    headers: authorization === null ? {} : { authorization },
  });
}

async function installation(
  registerName: string,
  appVersion: string | null | "no-state",
  revokedAt?: Date,
) {
  const { deviceId } = await insertEnrolledInstallation(db, {
    now: NOW,
    registerName,
    ...(revokedAt ? { revokedAt } : {}),
  });
  if (appVersion !== "no-state") {
    await db.insert(deviceState).values({ deviceId, appVersion });
  }
  return deviceId;
}

describe("GET /sync/registers-below-minimum", () => {
  beforeEach(() => {
    startApp(TOKEN);
  });

  it("answers 401 without an authorization header, reading nothing", async () => {
    await installation("Caja 1", "1.0.0");

    const response = await ask("1.4.0", null);

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain("Caja 1");
  });

  it("answers 401 to a wrong token", async () => {
    const response = await ask("1.4.0", "Bearer another-token");

    expect(response.statusCode).toBe(401);
  });

  it("answers 401 to a token without the Bearer scheme", async () => {
    const response = await ask("1.4.0", TOKEN);

    expect(response.statusCode).toBe(401);
  });

  it("answers 401 to every request when the cloud has no token configured", async () => {
    await app.close();
    startApp(undefined);

    expect((await ask("1.4.0", "Bearer ")).statusCode).toBe(401);
    expect((await ask("1.4.0", `Bearer ${TOKEN}`)).statusCode).toBe(401);
    expect((await ask("1.4.0", null)).statusCode).toBe(401);
  });

  it("answers 401 before looking at the minimum when the token is wrong", async () => {
    const response = await ask("not-a-version", "Bearer another-token");

    expect(response.statusCode).toBe(401);
  });

  it.each([undefined, "", "1.4", "v1.4.0"])("refuses the minimum %j with 400", async (minimum) => {
    const response = await ask(minimum);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("lists the installations in service that reported a version below the minimum", async () => {
    await installation("Caja 1", "1.3.0");

    const response = await ask("1.4.0");

    expect(response.statusCode).toBe(200);
    expect(registersBelowMinimumSchema.parse(response.json())).toEqual({
      registers: [{ register_name: "Caja 1", app_version: "1.3.0" }],
    });
  });

  it("leaves out an installation at or above the minimum", async () => {
    await installation("Caja 1", "1.4.0");
    await installation("Caja 2", "2.0.0");

    const response = await ask("1.4.0");

    expect(response.json()).toEqual({ registers: [] });
  });

  it("lists an installation that never reported a version, with or without state", async () => {
    await installation("Caja 1", null);
    await installation("Caja 2", "no-state");

    const response = await ask("1.4.0");

    expect(response.json().registers).toEqual(
      expect.arrayContaining([
        { register_name: "Caja 1", app_version: null },
        { register_name: "Caja 2", app_version: null },
      ]),
    );
    expect(response.json().registers).toHaveLength(2);
  });

  it("leaves out a revoked installation", async () => {
    const deviceId = await installation("Caja 1", "1.0.0", new Date("2026-10-01T00:00:00.000Z"));
    await db
      .update(deviceState)
      .set({ appVersion: null })
      .where(eq(deviceState.deviceId, deviceId));

    const response = await ask("1.4.0");

    expect(response.json()).toEqual({ registers: [] });
  });
});
