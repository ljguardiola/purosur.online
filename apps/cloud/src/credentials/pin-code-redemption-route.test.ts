import { argon2Sync } from "node:crypto";
import {
  changesPageSchema,
  cloudErrorSchema,
  decodePinSalt,
  encodePinHash,
  PIN_HASH_SCHEME,
  pinCodeRedemptionSchema,
} from "@purosur/contracts";
import { and, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import {
  auditLog,
  changes,
  pinCodeRedemptionAttempts,
  roles,
  userPinCodes,
  userPins,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { hashSecretCode } from "../platform/secret-code.js";
import { issueDeviceToken } from "../register/device-token.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerChangesRoute } from "../sync/changes-route.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerPinCodeRedemptionRoute } from "./pin-code-redemption-route.js";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const CODE = "P4NX7KWE2QRT6MZD";
const NEW_PIN = "482915";

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
  const devices = {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
  };
  registerPinCodeRedemptionRoute(app, devices);
  registerChangesRoute(app, devices);
});

afterEach(async () => {
  await app.close();
});

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60 * 1000);
}

async function insertUserWithCode(
  overrides: { active?: boolean; expiresAt?: Date; failedAttempts?: number } = {},
): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: "Cajera", isAdministrator: false })
    .returning({ id: roles.id });
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      locationId: await seededLocationId(db),
      active: overrides.active ?? true,
    })
    .returning({ id: users.id });
  if (!role || !user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
  await db.insert(userPinCodes).values({
    userId: user.id,
    codeHash: hashSecretCode(CODE),
    issuedBy: user.id,
    issuedAt: minutesFromNow(-5),
    expiresAt: overrides.expiresAt ?? minutesFromNow(10),
    failedAttempts: overrides.failedAttempts ?? 0,
  });
  return user.id;
}

function redeem(
  deviceToken: string | undefined,
  payload: object = { reset_code: CODE, new_pin: NEW_PIN },
) {
  return app.inject({
    method: "POST",
    url: "/pin-code-redemptions",
    payload,
    ...(deviceToken !== undefined && { headers: { authorization: `Bearer ${deviceToken}` } }),
  });
}

describe("POST /pin-code-redemptions", () => {
  it("stores the chosen PIN's verifier and answers the salt and hash the register derives its own from", async () => {
    const userId = await insertUserWithCode();
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await redeem(deviceToken, {
      reset_code: "p4nx 7kwe 2qrt 6mzd",
      new_pin: NEW_PIN,
    });

    expect(response.statusCode).toBe(200);
    const body = pinCodeRedemptionSchema.parse(response.json());
    expect(body.user_id).toBe(userId);
    expect(body.pin_hash).toBe(
      encodePinHash(
        argon2Sync("argon2id", {
          message: NEW_PIN,
          nonce: decodePinSalt(body.salt) ?? new Uint8Array(),
          memory: PIN_HASH_SCHEME.memoryKiB,
          passes: PIN_HASH_SCHEME.passes,
          parallelism: PIN_HASH_SCHEME.parallelism,
          tagLength: PIN_HASH_SCHEME.hashLength,
        }),
      ),
    );
    expect(await db.select().from(userPins)).toEqual([
      { userId, salt: body.salt, hash: body.pin_hash, setAt: NOW },
    ]);
  });

  it("bumps the user's version, logs the user change and marks the code redeemed in the same operation", async () => {
    const userId = await insertUserWithCode();
    const { deviceToken, locationId } = await insertEnrolledInstallation(db, { now: NOW });

    await redeem(deviceToken);

    const [user] = await db
      .select({ version: users.version })
      .from(users)
      .where(eq(users.id, userId));
    expect(user?.version).toBe(2);
    expect(
      await db
        .select({ version: changes.version, op: changes.op, locationId: changes.locationId })
        .from(changes)
        .where(and(eq(changes.entity, "user"), eq(changes.entityId, userId))),
    ).toEqual([{ version: 2, op: "update", locationId }]);
    const [pinCode] = await db.select().from(userPinCodes);
    expect(pinCode?.redeemedAt).toEqual(NOW);
  });

  it("audits the redemption as the person's own act, naming the register", async () => {
    const userId = await insertUserWithCode();
    const { deviceToken, registerId } = await insertEnrolledInstallation(db, { now: NOW });

    await redeem(deviceToken);

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, userId));
    expect(entry).toMatchObject({
      entity: "user",
      actorId: userId,
      newValue: { pin_code_redeemed_at: NOW.toISOString(), register_id: registerId },
      at: NOW,
    });
  });

  it("reaches the register's next pull as the user's new salt and hash", async () => {
    await insertUserWithCode();
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const body = pinCodeRedemptionSchema.parse((await redeem(deviceToken)).json());
    const pulled = await app.inject({
      method: "GET",
      url: "/changes?since=0",
      headers: { authorization: `Bearer ${deviceToken}` },
    });

    const userChange = changesPageSchema
      .parse(pulled.json())
      .changes.find((change) => change.entity === "user");
    expect(userChange).toMatchObject({
      row: { salt: body.salt, pin_hash: body.pin_hash, version: 2 },
    });
  });

  it("answers reset_code_burned to a repeat of a redeemed code, leaving the PIN as first chosen", async () => {
    await insertUserWithCode();
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const first = pinCodeRedemptionSchema.parse((await redeem(deviceToken)).json());

    const repeat = await redeem(deviceToken, { reset_code: CODE, new_pin: "999999" });

    expect(repeat.statusCode).toBe(410);
    expect(cloudErrorSchema.parse(repeat.json())).toMatchObject({ code: "reset_code_burned" });
    expect((await db.select().from(userPins))[0]?.hash).toBe(first.pin_hash);
  });

  it("answers reset_code_invalid to a code no user holds, and to one whose user is inactive", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const unknown = await redeem(deviceToken);
    await insertUserWithCode({ active: false });
    const inactive = await redeem(deviceToken);

    for (const response of [unknown, inactive]) {
      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "reset_code_invalid" });
    }
    expect(await db.select().from(userPins)).toHaveLength(0);
  });

  it("answers reset_code_expired to a code past its expiry", async () => {
    await insertUserWithCode({ expiresAt: minutesFromNow(-1) });
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await redeem(deviceToken);

    expect(response.statusCode).toBe(410);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "reset_code_expired" });
  });

  it("refuses a PIN that is too short as a new_pin validation failure and counts it against the code", async () => {
    await insertUserWithCode();
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await redeem(deviceToken, { reset_code: CODE, new_pin: "12345" });

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "validation_failed",
      details: [{ field: "new_pin" }],
    });
    const [pinCode] = await db.select().from(userPinCodes);
    expect(pinCode?.failedAttempts).toBe(1);
    expect(await db.select().from(userPins)).toHaveLength(0);
  });

  it.each([
    [
      "a code that is not 16 base32 characters",
      { reset_code: "ABC", new_pin: NEW_PIN },
      "reset_code",
    ],
    ["no new_pin", { reset_code: CODE }, "new_pin"],
  ])("refuses a body with %s", async (_case, payload, field) => {
    await insertUserWithCode();
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await redeem(deviceToken, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed", details: [{ field }] });
    expect(await db.select().from(pinCodeRedemptionAttempts)).toHaveLength(0);
  });

  it("answers rate_limited with the wait once the register has made ten attempts in the hour", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await redeem(deviceToken);
    }
    await insertUserWithCode();

    const response = await redeem(deviceToken);

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("3600");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "rate_limited",
      details: [{ retry_after_seconds: 3600 }],
    });
    expect(await db.select().from(userPins)).toHaveLength(0);
  });

  it.each([
    ["no device token", undefined],
    ["a device token no installation holds", issueDeviceToken().deviceToken],
  ])("refuses a request with %s, redeeming nothing", async (_case, deviceToken) => {
    await insertUserWithCode();
    await insertEnrolledInstallation(db, { now: NOW });

    const response = await redeem(deviceToken);

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
    expect(await db.select().from(userPins)).toHaveLength(0);
    expect(await db.select().from(pinCodeRedemptionAttempts)).toHaveLength(0);
  });

  it("refuses a revoked installation's token", async () => {
    await insertUserWithCode();
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      revokedAt: new Date("2026-09-29T09:00:00.000Z"),
    });

    const response = await redeem(deviceToken);

    expect(response.statusCode).toBe(401);
    expect(await db.select().from(userPins)).toHaveLength(0);
  });
});
