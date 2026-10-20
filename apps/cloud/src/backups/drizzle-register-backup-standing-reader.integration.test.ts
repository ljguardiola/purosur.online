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

async function enrolledRegister(registerName: string, revokedAt?: Date) {
  const installation = await insertEnrolledInstallation(db, {
    now: NOW,
    registerName,
    ...(revokedAt && { revokedAt }),
  });
  await db
    .insert(registerSnapshotKeys)
    .values({ registerId: installation.registerId, version: 1, key: "k" });
  return installation;
}

async function insertGeneration(
  register: { registerId: string; deviceId: string },
  createdAt: Date,
  lastDeviceSeq: number,
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
    lastDeviceSeq,
    status: "verified",
    ...overrides,
  });
}

async function insertChange(deviceId: string, deviceSeq: number, occurredAt: Date) {
  await insertInboxEvent(db, deviceId, { deviceSeq, occurredAt });
}

async function standingOf(registerId: string) {
  const standings = await reader.watchedRegisterBackupStandings();
  return standings.find((standing) => standing.registerId === registerId);
}

describe("DrizzleRegisterBackupStandingReader", () => {
  it("reports no verified generation and no changes for a register that recorded neither", async () => {
    const register = await enrolledRegister("Caja sin cambios");

    expect(await standingOf(register.registerId)).toEqual({
      registerId: register.registerId,
      lastVerifiedGenerationAt: null,
      firstChangeSinceLastVerifiedAt: null,
    });
  });

  it("counts every change when the register never had a verified generation", async () => {
    const register = await enrolledRegister("Caja sin generaciones");
    await insertChange(register.deviceId, 1, at("10:30"));
    await insertChange(register.deviceId, 2, at("09:15"));

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: null,
      firstChangeSinceLastVerifiedAt: at("09:15"),
    });
  });

  it("measures from the newest verified generation and takes the first change it does not hold", async () => {
    const register = await enrolledRegister("Caja con generaciones");
    await insertGeneration(register, at("08:00"), 3);
    await insertGeneration(register, at("10:00"), 5);
    await insertChange(register.deviceId, 4, at("09:00"));
    await insertChange(register.deviceId, 6, at("11:30"));
    await insertChange(register.deviceId, 7, at("10:45"));

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("10:00"),
      firstChangeSinceLastVerifiedAt: at("10:45"),
    });
  });

  it("reports no changes when the newest verified generation holds every change", async () => {
    const register = await enrolledRegister("Caja respaldada");
    await insertChange(register.deviceId, 1, at("09:00"));
    await insertChange(register.deviceId, 2, at("09:30"));
    await insertGeneration(register, at("10:00"), 2);

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("10:00"),
      firstChangeSinceLastVerifiedAt: null,
    });
  });

  it("counts a change the newest verified generation does not hold even when it was recorded before the generation was declared", async () => {
    const register = await enrolledRegister("Caja sin conexión");
    await insertChange(register.deviceId, 5, at("10:00"));
    await insertChange(register.deviceId, 6, at("10:30"));
    await insertGeneration(register, at("12:00"), 5);

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("12:00"),
      firstChangeSinceLastVerifiedAt: at("10:30"),
    });
  });

  it("leaves out a change the newest verified generation holds even when its time is after the generation's", async () => {
    const register = await enrolledRegister("Caja con reloj adelantado");
    await insertChange(register.deviceId, 5, at("13:00"));
    await insertGeneration(register, at("12:00"), 5);

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("12:00"),
      firstChangeSinceLastVerifiedAt: null,
    });
  });

  it("ignores generations that are not verified", async () => {
    const register = await enrolledRegister("Caja con generaciones sin verificar");
    await insertGeneration(register, at("08:00"), 1);
    await insertGeneration(register, at("09:00"), 10, { status: "declared" });
    await insertGeneration(register, at("09:30"), 10, { status: "uploaded" });
    await insertGeneration(register, at("09:45"), 10, {
      status: "failed",
      failureReason: "hash_mismatch",
    });
    await insertChange(register.deviceId, 2, at("08:30"));

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("08:00"),
      firstChangeSinceLastVerifiedAt: at("08:30"),
    });
  });

  it("still counts a verified generation that was pruned", async () => {
    const register = await enrolledRegister("Caja con generación podada");
    await insertGeneration(register, at("10:00"), 3, { pruned: true, objectDeleted: true });
    await insertChange(register.deviceId, 3, at("09:00"));

    expect(await standingOf(register.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("10:00"),
      firstChangeSinceLastVerifiedAt: null,
    });
  });

  it("counts the changes of a revoked installation of a register that never had a verified generation", async () => {
    const revoked = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja reemplazada",
      revokedAt: at("07:00"),
    });
    const active = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: revoked.registerId,
    });
    await insertChange(revoked.deviceId, 1, at("06:00"));
    await insertChange(active.deviceId, 1, at("09:00"));

    expect(await standingOf(revoked.registerId)).toMatchObject({
      firstChangeSinceLastVerifiedAt: at("06:00"),
    });
  });

  it("counts every change of an installation enrolled after the one that took the newest verified generation", async () => {
    const earlier = await enrolledRegister("Caja reinstalada", at("10:30"));
    const later = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: earlier.registerId,
      enrolledAt: at("11:00"),
    });
    await insertGeneration(earlier, at("10:00"), 5);
    await insertChange(earlier.deviceId, 5, at("09:30"));
    await insertChange(later.deviceId, 1, at("11:15"));

    expect(await standingOf(earlier.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("10:00"),
      firstChangeSinceLastVerifiedAt: at("11:15"),
    });
  });

  it("leaves out the changes of an earlier installation once the newest verified generation belongs to a later one", async () => {
    const earlier = await enrolledRegister("Caja con instalación anterior", at("07:00"));
    const later = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: earlier.registerId,
      enrolledAt: at("07:30"),
    });
    await insertChange(earlier.deviceId, 10, at("13:00"));
    await insertChange(later.deviceId, 2, at("09:00"));
    await insertGeneration(later, at("12:00"), 2);

    expect(await standingOf(earlier.registerId)).toMatchObject({
      lastVerifiedGenerationAt: at("12:00"),
      firstChangeSinceLastVerifiedAt: null,
    });
  });

  it("leaves out a register without an active installation", async () => {
    const register = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja dada de baja",
      revokedAt: at("07:00"),
    });
    await insertChange(register.deviceId, 1, at("06:00"));

    expect(await standingOf(register.registerId)).toBeUndefined();
  });

  it("keeps the changes of one register out of another's standing", async () => {
    const first = await enrolledRegister("Caja uno");
    const second = await enrolledRegister("Caja dos");
    await insertChange(first.deviceId, 1, at("05:00"));

    expect(await standingOf(second.registerId)).toMatchObject({
      firstChangeSinceLastVerifiedAt: null,
    });
  });
});
