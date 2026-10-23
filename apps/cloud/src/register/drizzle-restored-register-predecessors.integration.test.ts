import { randomUUID } from "node:crypto";
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRestoredRegisterPredecessors } from "./drizzle-restored-register-predecessors.js";
import {
  aRegisterRestoredTwice,
  hoursAfter,
  insertBranch,
  insertInstallation,
  insertRegister,
  T0,
} from "./test-support/restored-register-installations.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let predecessors: DrizzleRestoredRegisterPredecessors<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("restored_register_predecessors");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  predecessors = new DrizzleRestoredRegisterPredecessors(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the standing of a predecessor installation", () => {
  it("is not of the register when no installation has the id", async () => {
    const registerId = await insertRegister(db, await insertBranch(db));

    expect(await predecessors.predecessorStanding(registerId, randomUUID())).toBe(
      "not_of_register",
    );
  });

  it("is not of the register when the installation belongs to another register", async () => {
    const branchId = await insertBranch(db);
    const registerId = await insertRegister(db, branchId);
    const otherRegisterId = await insertRegister(db, branchId);
    const otherInstallation = await insertInstallation(db, otherRegisterId, {
      enrolledAt: T0,
      revokedAt: hoursAfter(T0, 1),
    });

    expect(await predecessors.predecessorStanding(registerId, otherInstallation)).toBe(
      "not_of_register",
    );
  });

  it("is not revoked while the installation is still active", async () => {
    const registerId = await insertRegister(db, await insertBranch(db));
    const installation = await insertInstallation(db, registerId, { enrolledAt: T0 });

    expect(await predecessors.predecessorStanding(registerId, installation)).toBe("not_revoked");
  });

  it("is revoked once the installation was revoked", async () => {
    const registerId = await insertRegister(db, await insertBranch(db));
    const installation = await insertInstallation(db, registerId, {
      enrolledAt: T0,
      revokedAt: hoursAfter(T0, 1),
    });

    expect(await predecessors.predecessorStanding(registerId, installation)).toBe("revoked");
  });
});

describe("whether a cursor belongs to a replenishment", () => {
  it("holds for the predecessor and for installations enrolled after it", async () => {
    const { registerId, predecessor, second } = await aRegisterRestoredTwice(db);

    for (const deviceId of [predecessor, second]) {
      expect(await predecessors.isReplenishmentCursor(registerId, predecessor, deviceId)).toBe(
        true,
      );
    }
  });

  it("does not hold for an installation that does not exist, belongs to another register, or was enrolled before the predecessor", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice(db);
    const earlier = await insertInstallation(db, registerId, {
      enrolledAt: hoursAfter(T0, -3),
      revokedAt: hoursAfter(T0, -2),
    });
    const ofAnotherRegister = await insertInstallation(
      db,
      await insertRegister(db, await insertBranch(db)),
      {
        enrolledAt: hoursAfter(T0, 3),
      },
    );

    for (const deviceId of [randomUUID(), earlier, ofAnotherRegister]) {
      expect(await predecessors.isReplenishmentCursor(registerId, predecessor, deviceId)).toBe(
        false,
      );
    }
  });
});

describe("the first revoked installation of a register", () => {
  it("is the earliest enrolled installation other than the calling one", async () => {
    const { registerId, predecessor, third } = await aRegisterRestoredTwice(db);

    expect(await predecessors.firstRevokedInstallation(registerId, third)).toBe(predecessor);
  });

  it("is none for a register whose only installation is the calling one", async () => {
    const registerId = await insertRegister(db, await insertBranch(db));
    const calling = await insertInstallation(db, registerId, { enrolledAt: T0 });

    expect(await predecessors.firstRevokedInstallation(registerId, calling)).toBeUndefined();
  });

  it("never names an installation of another register", async () => {
    const branchId = await insertBranch(db);
    const registerId = await insertRegister(db, branchId);
    const calling = await insertInstallation(db, registerId, { enrolledAt: hoursAfter(T0, 5) });
    await insertInstallation(db, await insertRegister(db, branchId), {
      enrolledAt: T0,
      revokedAt: hoursAfter(T0, 1),
    });

    expect(await predecessors.firstRevokedInstallation(registerId, calling)).toBeUndefined();
  });
});
