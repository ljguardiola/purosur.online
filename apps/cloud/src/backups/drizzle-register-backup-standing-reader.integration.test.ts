import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerSnapshotGenerations, registerSnapshotKeys } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertInboxEvent } from "../sync/test-support/inbox-events.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRegisterBackupStandingReader } from "./drizzle-register-backup-standing-reader.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");
const SHA = "ab".repeat(32);

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let reader: DrizzleRegisterBackupStandingReader<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_backup_standing_reader");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
  reader = new DrizzleRegisterBackupStandingReader(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function at(time: string): Date {
  return new Date(`2026-10-14T${time}:00.000Z`);
}

async function enrolledRegister(registerName: string) {
  const installation = await insertEnrolledInstallation(db, { now: NOW, registerName });
  await db
    .insert(registerSnapshotKeys)
    .values({ registerId: installation.registerId, version: 1, key: "k" });
  return installation;
}

async function insertGeneration(
  register: { registerId: string; deviceId: string },
  createdAt: Date,
  overrides: Partial<typeof registerSnapshotGenerations.$inferInsert> = {},
) {
  await db.insert(registerSnapshotGenerations).values({
    id: crypto.randomUUID(),
    registerId: register.registerId,
    deviceId: register.deviceId,
    createdAt,
    size: 4,
    sha256: SHA,
    keyVersion: 1,
    status: "verified",
    ...overrides,
  });
}

async function standingOf(registerId: string) {
  const standings = await reader.watchedRegisterBackupStandings();
  return standings.find((standing) => standing.registerId === registerId);
}

describe("DrizzleRegisterBackupStandingReader", () => {
  it("reports the register's location and no changes when it recorded none", async () => {
    const register = await enrolledRegister("Caja sin cambios");

    expect(await standingOf(register.registerId)).toEqual({
      registerId: register.registerId,
      lastVerifiedGenerationAt: null,
      firstChangeSinceLastVerifiedAt: null,
    });
  });

  it("counts every change when the register never had a verified generation", async () => {
    const register = await enrolledRegister("Caja sin generaciones");
    await insertInboxEvent(db, register.deviceId, { occurredAt: at("10:30") });
    await insertInboxEvent(db, register.deviceId, { occurredAt: at("09:15") });

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: null,
      firstChangeSinceLastVerifiedAt: at("09:15"),
    });
  });

  it("measures from the newest verified generation and takes the first change after it", async () => {
    const register = await enrolledRegister("Caja con generaciones");
    await insertGeneration(register, at("08:00"));
    await insertGeneration(register, at("10:00"));
    await insertInboxEvent(db, register.deviceId, { occurredAt: at("09:00") });
    await insertInboxEvent(db, register.deviceId, { occurredAt: at("11:30") });
    await insertInboxEvent(db, register.deviceId, { occurredAt: at("10:45") });

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("10:00"),
      firstChangeSinceLastVerifiedAt: at("10:45"),
    });
  });

  it("reports no changes when every change precedes the newest verified generation", async () => {
    const register = await enrolledRegister("Caja respaldada");
    await insertInboxEvent(db, register.deviceId, { occurredAt: at("09:00") });
    await insertGeneration(register, at("10:00"));

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("10:00"),
      firstChangeSinceLastVerifiedAt: null,
    });
  });

  it("ignores generations that are not verified", async () => {
    const register = await enrolledRegister("Caja con generaciones sin verificar");
    await insertGeneration(register, at("08:00"));
    await insertGeneration(register, at("09:00"), { status: "declared" });
    await insertGeneration(register, at("09:30"), { status: "uploaded" });
    await insertGeneration(register, at("09:45"), {
      status: "failed",
      failureReason: "hash_mismatch",
    });
    await insertInboxEvent(db, register.deviceId, { occurredAt: at("08:30") });

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("08:00"),
      firstChangeSinceLastVerifiedAt: at("08:30"),
    });
  });

  it("still counts a verified generation that was pruned", async () => {
    const register = await enrolledRegister("Caja con generación podada");
    await insertGeneration(register, at("10:00"), { pruned: true, objectDeleted: true });
    await insertInboxEvent(db, register.deviceId, { occurredAt: at("09:00") });

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("10:00"),
      firstChangeSinceLastVerifiedAt: null,
    });
  });

  it("counts the changes of a revoked installation of the same register", async () => {
    const revoked = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja reemplazada",
      revokedAt: at("07:00"),
    });
    const active = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: revoked.registerId,
    });
    await insertInboxEvent(db, revoked.deviceId, { occurredAt: at("06:00") });
    await insertInboxEvent(db, active.deviceId, { occurredAt: at("09:00") });

    expect(await standingOf(revoked.registerId)).toMatchObject({
      firstChangeSinceLastVerifiedAt: at("06:00"),
    });
  });

  it("leaves out a register without an active installation", async () => {
    const register = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja dada de baja",
      revokedAt: at("07:00"),
    });
    await insertInboxEvent(db, register.deviceId, { occurredAt: at("06:00") });

    expect(await standingOf(register.registerId)).toBeUndefined();
  });

  it("keeps the changes of one register out of another's standing", async () => {
    const first = await enrolledRegister("Caja uno");
    const second = await enrolledRegister("Caja dos");
    await insertInboxEvent(db, first.deviceId, { occurredAt: at("05:00") });

    expect(await standingOf(second.registerId)).toMatchObject({
      firstChangeSinceLastVerifiedAt: null,
    });
  });
});
