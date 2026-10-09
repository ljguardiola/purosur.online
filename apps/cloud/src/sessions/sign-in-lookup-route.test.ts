import { cloudErrorSchema, signInLookupSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { locations, signInLookupAttempts, userPins, users } from "../platform/db/schema.js";
import { issueDeviceToken } from "../register/device-token.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRouteAccess } from "./route-access.js";
import { registerSignInLookupRoute } from "./sign-in-lookup-route.js";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const EMAIL = "grace@example.com";

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
  registerRouteAccess(app);
  registerSignInLookupRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

async function insertUser(
  overrides: { email?: string; active?: boolean; locationId?: string; withPin?: boolean } = {},
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Grace Hopper",
      email: overrides.email ?? EMAIL,
      locationId: overrides.locationId ?? (await seededLocationId(db)),
      active: overrides.active ?? true,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  if (overrides.withPin) {
    await db.insert(userPins).values({ userId: user.id, salt: "salt", hash: "hash", setAt: NOW });
  }
  return user.id;
}

async function insertOtherLocation(): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the location returned no row");
  }
  return location.id;
}

function lookUp(deviceToken: string | undefined, payload: object = { email: EMAIL }) {
  return app.inject({
    method: "POST",
    url: "/sign-in-lookups",
    payload,
    ...(deviceToken !== undefined && { headers: { authorization: `Bearer ${deviceToken}` } }),
  });
}

describe("POST /sign-in-lookups", () => {
  it("answers who the email belongs to and that they have a PIN", async () => {
    const userId = await insertUser({ withPin: true });
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await lookUp(deviceToken);

    expect(response.statusCode).toBe(200);
    expect(signInLookupSchema.parse(response.json())).toEqual({
      kind: "found",
      user_id: userId,
      has_pin: true,
    });
  });

  it("answers that a person without a PIN has none", async () => {
    const userId = await insertUser();
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await lookUp(deviceToken);

    expect(signInLookupSchema.parse(response.json())).toEqual({
      kind: "found",
      user_id: userId,
      has_pin: false,
    });
  });

  it("finds a person typing their email in another case or with spaces around it", async () => {
    const userId = await insertUser();
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await lookUp(deviceToken, { email: "  Grace@Example.COM " });

    expect(signInLookupSchema.parse(response.json())).toMatchObject({
      kind: "found",
      user_id: userId,
    });
  });

  it("answers the same not-found body for an unknown email, a user of another branch and an inactive user", async () => {
    await insertUser({ email: "elsewhere@example.com", locationId: await insertOtherLocation() });
    await insertUser({ email: "gone@example.com", active: false });
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const answers = [];
    for (const email of ["nobody@example.com", "elsewhere@example.com", "gone@example.com"]) {
      answers.push(await lookUp(deviceToken, { email }));
    }

    for (const response of answers) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ kind: "not_found" });
    }
  });

  it("never echoes the email it was asked about", async () => {
    await insertUser({ withPin: true });
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const found = await lookUp(deviceToken);
    const notFound = await lookUp(deviceToken, { email: "nobody@example.com" });

    expect(found.body).not.toContain("example.com");
    expect(notFound.body).not.toContain("example.com");
  });

  it("counts every accepted lookup and refuses the eleventh in the hour with the wait", async () => {
    await insertUser();
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await lookUp(deviceToken)).statusCode).toBe(200);
    }

    const response = await lookUp(deviceToken);

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("3600");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "rate_limited",
      details: [{ retry_after_seconds: 3600 }],
    });
    expect(await db.select().from(signInLookupAttempts)).toHaveLength(10);
  });

  it("counts each register's lookups apart", async () => {
    const first = await insertEnrolledInstallation(db, { now: NOW });
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await lookUp(first.deviceToken);
    }

    const response = await lookUp(second.deviceToken);

    expect(response.statusCode).toBe(200);
  });

  it.each([
    ["no email", {}],
    ["something that is not an email", { email: "grace" }],
  ])("refuses a body with %s, counting nothing", async (_case, payload) => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await lookUp(deviceToken, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "email" }],
    });
    expect(await db.select().from(signInLookupAttempts)).toHaveLength(0);
  });

  it.each([
    ["no device token", undefined],
    ["a device token no installation holds", issueDeviceToken().deviceToken],
  ])("refuses a request with %s, counting nothing", async (_case, deviceToken) => {
    await insertUser();
    await insertEnrolledInstallation(db, { now: NOW });

    const response = await lookUp(deviceToken);

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
    expect(await db.select().from(signInLookupAttempts)).toHaveLength(0);
  });

  it("refuses a revoked installation's token", async () => {
    await insertUser();
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      revokedAt: new Date("2026-09-29T09:00:00.000Z"),
    });

    const response = await lookUp(deviceToken);

    expect(response.statusCode).toBe(401);
    expect(await db.select().from(signInLookupAttempts)).toHaveLength(0);
  });

  it("records the attempt against the asking register", async () => {
    const { deviceToken, registerId } = await insertEnrolledInstallation(db, { now: NOW });

    await lookUp(deviceToken);

    const attempts = await db
      .select()
      .from(signInLookupAttempts)
      .where(eq(signInLookupAttempts.registerId, registerId));
    expect(attempts.map((attempt) => attempt.attemptedAt)).toEqual([NOW]);
  });
});
