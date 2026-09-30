import { cloudErrorSchema, deviceEnrollmentSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import {
  alerts,
  registerContingencyTicketKeys,
  registerEnrollmentAttempts,
  registerEnrollmentCodes,
  registerInstallations,
  registerSnapshotKeys,
  registers,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerDeviceEnrollmentRoute } from "./device-enrollment-route.js";
import { hashDeviceToken } from "./device-token.js";
import { hashRegisterEnrollmentCode } from "./register-enrollment-code.js";
import { keyStore } from "./test-support/key-store.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const CODE = "P4NX7KWE2QRT6MZD";
const INJECTED_SOURCE_ADDRESS = "127.0.0.1";

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
  registerDeviceEnrollmentRoute(app, {
    db,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

async function insertRegisterWithCode(
  overrides: { expiresAt?: Date; redeemedAt?: Date | null; failedAttempts?: number } = {},
): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId: await seededLocationId(db), name: "Caja 1" })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  await db.insert(registerEnrollmentCodes).values({
    registerId: register.id,
    codeLookup: CODE.slice(0, 4),
    codeHash: hashRegisterEnrollmentCode(CODE),
    issuedAt: minutesAgo(5),
    expiresAt: overrides.expiresAt ?? minutesAgo(-10),
    redeemedAt: overrides.redeemedAt ?? null,
    failedAttempts: overrides.failedAttempts ?? 0,
  });
  return register.id;
}

function enroll(
  payload: unknown = {
    code: "p4nx 7kwe 2qrt 6mzd",
    hostname: "CAJA-MOSTRADOR",
    windows_version: "Windows 11 Pro 10.0.26100",
  },
) {
  return app.inject({ method: "POST", url: "/devices/enroll", payload: payload as object });
}

describe("POST /devices/enroll", () => {
  it("enrolls the installation without a session and answers its device id and device token", async () => {
    const registerId = await insertRegisterWithCode();

    const response = await enroll();

    expect(response.statusCode).toBe(200);
    const body = deviceEnrollmentSchema.parse(response.json());
    const [installation] = await db
      .select()
      .from(registerInstallations)
      .where(eq(registerInstallations.id, body.device_id));
    expect(installation).toMatchObject({
      registerId,
      tokenHash: hashDeviceToken(body.device_token),
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      tokenIssuedAt: NOW,
      pendingTokenHash: null,
      enrolledAt: NOW,
      revokedAt: null,
    });
  });

  it("answers the installation's keys: its register's snapshot key versions and contingency-ticket key, and its own outbox-chain key", async () => {
    const registerId = await insertRegisterWithCode();

    const response = await enroll();

    const body = deviceEnrollmentSchema.parse(response.json());
    const held = await keyStore(db).transaction((tx) => tx.lockRegisterKeys(registerId));
    const [installation] = await keyStore(db).transaction(async (tx) => [
      await tx.lockInstallationByTokenPrefix(body.device_token.split(".")[0] ?? ""),
    ]);
    expect(body.snapshot_key_versions).toEqual(held.snapshotKeys);
    expect(body.snapshot_key_versions).toHaveLength(1);
    expect([body.contingency_ticket_key]).toEqual(held.contingencyTicketKeys);
    expect(body.outbox_chain_key).toBe(installation?.outboxChainKey);
    expect(
      new Set([
        body.snapshot_key_versions[0]?.key,
        body.contingency_ticket_key.key,
        body.outbox_chain_key,
      ]).size,
    ).toBe(3);
  });

  it("stores none of the keys it hands over as they were handed over", async () => {
    await insertRegisterWithCode();

    const body = deviceEnrollmentSchema.parse((await enroll()).json());

    const [snapshotRows, ticketRows, installationRows] = await Promise.all([
      db.select({ key: registerSnapshotKeys.key }).from(registerSnapshotKeys),
      db.select({ key: registerContingencyTicketKeys.key }).from(registerContingencyTicketKeys),
      db.select({ key: registerInstallations.outboxChainKey }).from(registerInstallations),
    ]);
    const stored = [...snapshotRows, ...ticketRows, ...installationRows].map((row) => row.key);
    expect(stored).toHaveLength(3);
    for (const handedOver of [
      body.snapshot_key_versions[0]?.key,
      body.contingency_ticket_key.key,
      body.outbox_chain_key,
    ]) {
      expect(stored).not.toContain(handedOver);
    }
  });

  it("revokes the installation that held the register before", async () => {
    const registerId = await insertRegisterWithCode();
    const [previous] = await db
      .insert(registerInstallations)
      .values({
        registerId,
        tokenLookupPrefix: "previous",
        tokenHash: "previous-hash",
        hostname: "VIEJA",
        windowsVersion: "Windows 10",
        tokenIssuedAt: minutesAgo(60 * 24),
        enrolledAt: minutesAgo(60 * 24),
      })
      .returning({ id: registerInstallations.id });

    await enroll();

    const [after] = await db
      .select({ revokedAt: registerInstallations.revokedAt })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, previous?.id ?? ""));
    expect(after?.revokedAt).toEqual(NOW);
  });

  it("opens the register's enrollment alert along with the installation", async () => {
    const registerId = await insertRegisterWithCode();

    const response = await enroll();

    const body = deviceEnrollmentSchema.parse(response.json());
    expect(await db.select().from(alerts)).toEqual([
      expect.objectContaining({
        kind: "register_enrolled",
        scope: registerId,
        openedAt: NOW,
        detail: expect.objectContaining({ deviceId: body.device_id }),
      }),
    ]);
  });

  it("refuses a code that no longer works with enrollment_code_rejected, creating no installation", async () => {
    await insertRegisterWithCode({ expiresAt: NOW });

    const response = await enroll();

    expect(response.statusCode).toBe(403);
    expect(cloudErrorSchema.parse(response.json())).toEqual({
      code: "enrollment_code_rejected",
      message: "the enrollment code is expired, already used or burned by failed attempts",
      details: [],
    });
    expect(await db.select().from(registerInstallations)).toEqual([]);
    expect(await db.select().from(alerts)).toEqual([]);
  });

  it("refuses an attempt past the hour's limit as rate_limited with when to retry", async () => {
    await insertRegisterWithCode();
    await db.insert(registerEnrollmentAttempts).values(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 50].map((minutes) => ({
        keyKind: "source_address" as const,
        keyValue: INJECTED_SOURCE_ADDRESS,
        attemptedAt: minutesAgo(minutes),
      })),
    );

    const response = await enroll();

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe(String(10 * 60));
    expect(cloudErrorSchema.parse(response.json())).toEqual({
      code: "rate_limited",
      message: "too many enrollment attempts",
      details: [{ retry_after_seconds: 10 * 60 }],
    });
    expect(await db.select().from(registerInstallations)).toEqual([]);
  });

  it("refuses a malformed code with validation_failed naming the field, counting no attempt", async () => {
    await insertRegisterWithCode();

    const response = await enroll({
      code: "P4NX",
      hostname: "CAJA",
      windows_version: "Windows 11",
    });

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "validation_failed",
      details: [{ field: "code" }],
    });
    expect(await db.select().from(registerEnrollmentAttempts)).toEqual([]);
  });

  it("answers a body it can't read with the contract's envelope", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/devices/enroll",
      headers: { "content-type": "application/json" },
      payload: "{",
    });

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
  });

  it("is declared public, since an installation has no session before it enrolls", async () => {
    await app.ready();

    expect(app.routeAccessInventory()).toContainEqual({
      method: "POST",
      url: "/devices/enroll",
      access: { level: "public" },
    });
  });
});
