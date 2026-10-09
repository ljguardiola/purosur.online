import {
  buyerIdentificationThresholdConfirmationRequiredSchema,
  buyerIdentificationThresholdSchema,
} from "@purosur/contracts";
import { PASSKEY_AUTHORIZATION_WINDOW_MS } from "@purosur/domain";
import { asc, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../access/session-cookie.js";
import { generateSessionId, hashSessionId } from "../access/session-id.js";
import {
  auditLog,
  buyerIdentificationThresholds,
  changes,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { removeSeededThreshold } from "../test-support/remove-seeded-threshold.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerBuyerIdentificationThresholdRecordRoute } from "./buyer-identification-threshold-record-route.js";

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
  await removeSeededThreshold(testDatabase.db);
  app = Fastify();
  registerBuyerIdentificationThresholdRecordRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
});

afterEach(async () => {
  await app.close();
});

async function insertUserWithPermissions(permissionKeys: string[]): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: "Contadora", isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  if (permissionKeys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
  }
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
  return user.id;
}

async function insertSession(userId: string, authorizedAt: Date | null = NOON): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
    passkeyAuthorizedAt: authorizedAt,
  });
  return rawSessionId;
}

async function signedInWithPermission(authorizedAt: Date | null = NOON) {
  const userId = await insertUserWithPermissions(["change_fiscal_configuration"]);
  return { userId, rawSessionId: await insertSession(userId, authorizedAt) };
}

function post(body: Record<string, unknown>, rawSessionId?: string, origin = BACKOFFICE_ORIGIN) {
  return app.inject({
    method: "POST",
    url: "/buyer-identification-thresholds",
    headers: {
      origin,
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
    },
    payload: body,
  });
}

const BODY = { amount: 1_000_000, valid_from: "2026-10-01" };

async function storedThresholds() {
  return db
    .select()
    .from(buyerIdentificationThresholds)
    .orderBy(asc(buyerIdentificationThresholds.validFrom), asc(buyerIdentificationThresholds.revision));
}

describe("POST /buyer-identification-thresholds", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await post(BODY);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, recording nothing", async () => {
    const { rawSessionId } = await signedInWithPermission();

    const response = await post(BODY, rawSessionId, "https://attacker.example");

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await storedThresholds()).toEqual([]);
  });

  it("rejects a user without the change_fiscal_configuration permission with 403 forbidden, recording nothing", async () => {
    const cashierId = await insertUserWithPermissions(["sell_and_charge"]);
    const rawSessionId = await insertSession(cashierId);

    const response = await post(BODY, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await storedThresholds()).toEqual([]);
  });

  it("records the threshold and answers 201 with its id, amount and start day", async () => {
    const { rawSessionId } = await signedInWithPermission();

    const response = await post(BODY, rawSessionId);

    expect(response.statusCode).toBe(201);
    const body = buyerIdentificationThresholdSchema.parse(response.json());
    expect(body).toEqual({ id: expect.any(String), amount: 1_000_000, valid_from: "2026-10-01" });
    expect(await storedThresholds()).toMatchObject([
      { id: body.id, amount: 1_000_000, validFrom: "2026-10-01" },
    ]);
  });

  it("records who recorded it, audits it and logs it for the registers", async () => {
    const { userId, rawSessionId } = await signedInWithPermission();

    const response = await post(BODY, rawSessionId);

    const { id } = buyerIdentificationThresholdSchema.parse(response.json());
    expect(await storedThresholds()).toMatchObject([{ recordedBy: userId }]);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(entry).toMatchObject({
      entity: "buyer_identification_threshold",
      actorId: userId,
      previousValue: null,
      newValue: { amount: 1_000_000, valid_from: "2026-10-01", revision: 0 },
      at: NOON,
    });
    const logged = await db.select().from(changes).where(eq(changes.entityId, id));
    expect(logged).toMatchObject([{ entity: "buyer_identification_threshold", op: "insert" }]);
  });

  it("records a threshold that starts today", async () => {
    const { rawSessionId } = await signedInWithPermission();

    const response = await post({ ...BODY, valid_from: "2026-01-05" }, rawSessionId);

    expect(response.statusCode).toBe(201);
  });

  it("answers 409 threshold_before_today naming valid_from when the threshold starts before today, recording nothing", async () => {
    const { rawSessionId } = await signedInWithPermission();

    const response = await post({ ...BODY, valid_from: "2026-01-04" }, rawSessionId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "threshold_before_today",
      details: [{ field: "valid_from" }],
    });
    expect(await storedThresholds()).toEqual([]);
  });

  describe("a lower amount than the one in effect", () => {
    async function seedInEffect(userId: string) {
      await db
        .insert(buyerIdentificationThresholds)
        .values({ amount: 2_000_000, validFrom: "2025-06-01", recordedBy: userId });
    }

    it("answers 409 threshold_lower_than_in_effect with the amounts and the day, recording nothing", async () => {
      const { userId, rawSessionId } = await signedInWithPermission();
      await seedInEffect(userId);

      const response = await post({ ...BODY, amount: 1_000_000 }, rawSessionId);

      expect(response.statusCode).toBe(409);
      expect(buyerIdentificationThresholdConfirmationRequiredSchema.parse(response.json())).toEqual({
        code: "threshold_lower_than_in_effect",
        message: expect.any(String),
        in_effect_amount: 2_000_000,
        amount: 1_000_000,
        valid_from: "2026-10-01",
      });
      expect(await storedThresholds()).toHaveLength(1);
    });

    it("records it once the request confirms it", async () => {
      const { userId, rawSessionId } = await signedInWithPermission();
      await seedInEffect(userId);

      const response = await post(
        { ...BODY, amount: 1_000_000, confirm_lower_than_in_effect: true },
        rawSessionId,
      );

      expect(response.statusCode).toBe(201);
      expect(await storedThresholds()).toHaveLength(2);
    });
  });

  it("replaces the threshold of the same day with a new row of the next revision, auditing the replaced one", async () => {
    const { userId, rawSessionId } = await signedInWithPermission();
    await db
      .insert(buyerIdentificationThresholds)
      .values({ amount: 10_000, validFrom: "2026-10-01", recordedBy: userId });

    const response = await post(BODY, rawSessionId);

    expect(response.statusCode).toBe(201);
    const { id } = buyerIdentificationThresholdSchema.parse(response.json());
    expect(await storedThresholds()).toMatchObject([
      { amount: 10_000, validFrom: "2026-10-01", revision: 0 },
      { id, amount: 1_000_000, validFrom: "2026-10-01", revision: 1 },
    ]);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(entry).toMatchObject({
      previousValue: { amount: 10_000, valid_from: "2026-10-01", revision: 0 },
      newValue: { amount: 1_000_000, valid_from: "2026-10-01", revision: 1 },
    });
    const logged = await db.select().from(changes).where(eq(changes.entityId, id));
    expect(logged).toMatchObject([{ entity: "buyer_identification_threshold", op: "insert" }]);
  });

  it("answers 400 validation_failed naming the field of an invalid body, recording nothing", async () => {
    const { rawSessionId } = await signedInWithPermission();

    const response = await post({ ...BODY, amount: 0 }, rawSessionId);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "amount" }],
    });
    expect(await storedThresholds()).toEqual([]);
  });

  describe("the passkey authorization", () => {
    it("answers 401 authorization_required when the session's authorization is older than the window, recording nothing", async () => {
      const { rawSessionId } = await signedInWithPermission(
        new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000),
      );

      const response = await post(BODY, rawSessionId);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      expect(await storedThresholds()).toEqual([]);
    });

    it("checks the body before the authorization", async () => {
      const { rawSessionId } = await signedInWithPermission(null);

      const response = await post({ ...BODY, valid_from: "soon" }, rawSessionId);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation_failed" });
    });
  });
});
