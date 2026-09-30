import { cloudErrorSchema, firstPinCodeSchema } from "@purosur/contracts";
import { desc, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, locations, userPinCodes, userPins, users } from "../platform/db/schema.js";
import { hashSecretCode } from "../platform/secret-code.js";
import { issueDeviceToken } from "../register/device-token.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerFirstPinCodeRoute } from "./first-pin-code-route.js";
import type { EnqueueFirstPinCodeEmail } from "./graphile-first-pin-code-email-queue.js";
import { registerRouteAccess } from "./route-access.js";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const MISSING_ID = "00000000-0000-0000-0000-000000000000";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let enqueueEmail: ReturnType<typeof vi.fn<EnqueueFirstPinCodeEmail>>;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  enqueueEmail = vi.fn<EnqueueFirstPinCodeEmail>().mockResolvedValue();
  app = Fastify();
  registerRouteAccess(app);
  registerFirstPinCodeRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
    enqueueEmail,
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60 * 1000);
}

async function insertUser(
  overrides: { active?: boolean; hasPin?: boolean; locationId?: string } = {},
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      locationId: overrides.locationId ?? (await seededLocationId(db)),
      active: overrides.active ?? true,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  if (overrides.hasPin) {
    await db.insert(userPins).values({ userId: user.id, salt: "salt", hash: "hash", setAt: NOW });
  }
  return user.id;
}

function ask(deviceToken: string | undefined, payload: object) {
  return app.inject({
    method: "POST",
    url: "/first-pin-codes",
    payload,
    ...(deviceToken !== undefined && { headers: { authorization: `Bearer ${deviceToken}` } }),
  });
}

function queuedCode(): string {
  const [, queued] = enqueueEmail.mock.calls[0] ?? [];
  if (!queued) {
    throw new Error("test setup: no email was queued");
  }
  return queued.code;
}

describe("POST /first-pin-codes", () => {
  it("answers 201 with the expiry and queues one email with the code for the address on file", async () => {
    const userId = await insertUser();
    const { deviceToken } = await insertEnrolledInstallation(db);

    const response = await ask(deviceToken, { user_id: userId });

    expect(response.statusCode).toBe(201);
    expect(firstPinCodeSchema.parse(response.json())).toEqual({
      expires_at: minutesFromNow(15).toISOString(),
    });
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(enqueueEmail).toHaveBeenCalledWith(expect.anything(), {
      email: "grace@example.com",
      code: expect.stringMatching(/^[A-Z2-7]{16}$/),
      expiresAt: minutesFromNow(15),
    });
    expect(response.body).not.toContain(queuedCode());
  });

  it("stores only the hash of the queued code, with no issuer, for the person", async () => {
    const userId = await insertUser();
    const { deviceToken } = await insertEnrolledInstallation(db);

    await ask(deviceToken, { user_id: userId });

    expect(await db.select().from(userPinCodes)).toEqual([
      expect.objectContaining({
        userId,
        codeHash: hashSecretCode(queuedCode()),
        issuedBy: null,
        issuedAt: NOW,
        expiresAt: minutesFromNow(15),
        failedAttempts: 0,
        redeemedAt: null,
        supersededAt: null,
      }),
    ]);
  });

  it("audits the emission with the register and no actor, never the code", async () => {
    const userId = await insertUser();
    const { deviceToken, registerId } = await insertEnrolledInstallation(db);

    await ask(deviceToken, { user_id: userId });

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, userId));
    expect(entry).toMatchObject({
      entity: "user",
      actorId: null,
      newValue: {
        first_pin_code_expires_at: minutesFromNow(15).toISOString(),
        register_id: registerId,
      },
    });
    expect(JSON.stringify(entry)).not.toContain(queuedCode());
  });

  it("supersedes the person's earlier live code", async () => {
    const userId = await insertUser();
    await db.insert(userPinCodes).values({
      userId,
      codeHash: "earlier-hash",
      issuedBy: null,
      issuedAt: minutesFromNow(-10),
      expiresAt: minutesFromNow(5),
    });
    const { deviceToken } = await insertEnrolledInstallation(db);

    await ask(deviceToken, { user_id: userId });

    const codes = await db.select().from(userPinCodes).orderBy(desc(userPinCodes.issuedAt));
    expect(codes.map((code) => code.supersededAt)).toEqual([null, NOW]);
  });

  it("answers 409 pin_already_set for a person who has a PIN, queueing and storing nothing", async () => {
    const userId = await insertUser({ hasPin: true });
    const { deviceToken } = await insertEnrolledInstallation(db);

    const response = await ask(deviceToken, { user_id: userId });

    expect(response.statusCode).toBe(409);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "pin_already_set" });
    expect(enqueueEmail).not.toHaveBeenCalled();
    expect(await db.select().from(userPinCodes)).toHaveLength(0);
    expect(await db.select().from(userPins)).toHaveLength(1);
  });

  it.each([
    ["a user that does not exist", async () => MISSING_ID],
    ["a user who is inactive", () => insertUser({ active: false })],
    [
      "a user of another location",
      async () => {
        const [otherLocation] = await db
          .insert(locations)
          .values({})
          .returning({ id: locations.id });
        return insertUser({ locationId: otherLocation?.id ?? "" });
      },
    ],
  ])("answers 404 not_found for %s", async (_case, seed) => {
    const userId = await seed();
    const { deviceToken } = await insertEnrolledInstallation(db);

    const response = await ask(deviceToken, { user_id: userId });

    expect(response.statusCode).toBe(404);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "not_found" });
    expect(enqueueEmail).not.toHaveBeenCalled();
    expect(await db.select().from(userPinCodes)).toHaveLength(0);
  });

  it("answers 429 with when to retry after five codes in an hour, reset codes included", async () => {
    const userId = await insertUser();
    await db.insert(userPinCodes).values(
      [1, 2, 3, 4, 50].map((minutes) => ({
        userId,
        codeHash: `hash-${minutes}`,
        issuedBy: userId,
        issuedAt: minutesFromNow(-minutes),
        expiresAt: minutesFromNow(15 - minutes),
      })),
    );
    const { deviceToken } = await insertEnrolledInstallation(db);

    const response = await ask(deviceToken, { user_id: userId });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("600");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "rate_limited",
      details: [{ retry_after_seconds: 600 }],
    });
    expect(enqueueEmail).not.toHaveBeenCalled();
    expect(await db.select().from(userPinCodes)).toHaveLength(5);
  });

  it("answers 500 and stores, audits and queues nothing when the email cannot be queued", async () => {
    const userId = await insertUser();
    const { deviceToken } = await insertEnrolledInstallation(db);
    enqueueEmail.mockRejectedValue(new Error("queue unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await ask(deviceToken, { user_id: userId });

    expect(response.statusCode).toBe(500);
    expect(await db.select().from(userPinCodes)).toHaveLength(0);
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, userId))).toHaveLength(0);
  });

  it("refuses a body without a user id, before any lookup", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);

    const response = await ask(deviceToken, { user_id: "grace" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "user_id" }],
    });
  });

  it.each([
    ["no token", undefined],
    ["a token no installation holds", issueDeviceToken().deviceToken],
  ])("answers 401 device_token_rejected with %s", async (_case, token) => {
    const userId = await insertUser();

    const response = await ask(token, { user_id: userId });

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
    expect(enqueueEmail).not.toHaveBeenCalled();
    expect(await db.select().from(userPinCodes)).toHaveLength(0);
  });

  it("answers 401 device_token_rejected to a revoked installation", async () => {
    const userId = await insertUser();
    const { deviceToken } = await insertEnrolledInstallation(db, { revokedAt: NOW });

    const response = await ask(deviceToken, { user_id: userId });

    expect(response.statusCode).toBe(401);
    expect(await db.select().from(userPinCodes)).toHaveLength(0);
  });
});
