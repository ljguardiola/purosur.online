import { enrollInstallation } from "@purosur/domain/register/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  registerEnrollmentAttempts,
  registerEnrollmentCodes,
  registerInstallations,
  registers,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { issueDeviceToken } from "./device-token.js";
import { DrizzleRegisterStore } from "./drizzle-register-store.js";
import {
  hashRegisterEnrollmentCode,
  registerEnrollmentCodeMatches,
} from "./register-enrollment-code.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const CODE = "P4NX7KWE2QRT6MZD";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

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

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

async function insertRegister(name: string): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId: await seededLocationId(db), name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

async function insertCode(
  registerId: string,
  code: string,
  overrides: { failedAttempts?: number; redeemedAt?: Date | null } = {},
): Promise<void> {
  await db.insert(registerEnrollmentCodes).values({
    registerId,
    codeLookup: code.slice(0, 4),
    codeHash: hashRegisterEnrollmentCode(code),
    issuedAt: minutesAgo(5),
    expiresAt: minutesAgo(-10),
    redeemedAt: overrides.redeemedAt ?? null,
    failedAttempts: overrides.failedAttempts ?? 0,
  });
}

async function insertInstallation(registerId: string, prefix: string): Promise<string> {
  const [installation] = await db
    .insert(registerInstallations)
    .values({
      registerId,
      tokenLookupPrefix: prefix,
      tokenHash: `hash-${prefix}`,
      hostname: "VIEJA",
      windowsVersion: "Windows 10 Pro 10.0.19045",
      enrolledAt: minutesAgo(60 * 24),
    })
    .returning({ id: registerInstallations.id });
  if (!installation) {
    throw new Error("test setup: seeding the installation returned no row");
  }
  return installation.id;
}

function adapterStore() {
  return new DrizzleRegisterStore(db);
}

describe("DrizzleRegisterStore", () => {
  it("locks only the codes that share the first group, in register id order", async () => {
    const first = await insertRegister("Caja 1");
    const second = await insertRegister("Caja 2");
    const other = await insertRegister("Caja 3");
    await insertCode(first, CODE);
    await insertCode(second, "P4NXAAAAAAAAAAAA", { failedAttempts: 2 });
    await insertCode(other, "ZZZZAAAAAAAAAAAA");

    const locked = await adapterStore().transaction((tx) => tx.lockEnrollmentCodes("P4NX"));

    expect(locked.map((code) => code.registerId)).toEqual([first, second].sort());
    expect(locked.find((code) => code.registerId === second)).toMatchObject({
      codeHash: hashRegisterEnrollmentCode("P4NXAAAAAAAAAAAA"),
      failedAttempts: 2,
      redeemedAt: null,
      expiresAt: minutesAgo(-10),
    });
  });

  it("answers the accepted attempts of one key after a moment, newest first", async () => {
    await db.insert(registerEnrollmentAttempts).values([
      { keyKind: "source_address", keyValue: "203.0.113.7", attemptedAt: minutesAgo(61) },
      { keyKind: "source_address", keyValue: "203.0.113.7", attemptedAt: minutesAgo(60) },
      { keyKind: "source_address", keyValue: "203.0.113.7", attemptedAt: minutesAgo(30) },
      { keyKind: "source_address", keyValue: "203.0.113.7", attemptedAt: minutesAgo(10) },
      { keyKind: "source_address", keyValue: "198.51.100.1", attemptedAt: minutesAgo(5) },
      { keyKind: "register", keyValue: "203.0.113.7", attemptedAt: minutesAgo(5) },
    ]);

    const accepted = await adapterStore().transaction((tx) =>
      tx.acceptedEnrollmentAttempts(
        { kind: "source_address", value: "203.0.113.7" },
        minutesAgo(60),
      ),
    );

    expect(accepted).toEqual([minutesAgo(10), minutesAgo(30)]);
  });

  it("records an attempt under each key and forgets that key's attempts older than an hour", async () => {
    await db.insert(registerEnrollmentAttempts).values([
      { keyKind: "source_address", keyValue: "203.0.113.7", attemptedAt: minutesAgo(60) },
      { keyKind: "source_address", keyValue: "203.0.113.7", attemptedAt: minutesAgo(59) },
      { keyKind: "source_address", keyValue: "198.51.100.1", attemptedAt: minutesAgo(90) },
    ]);

    await adapterStore().transaction(async (tx) => {
      await tx.lockEnrollmentAttempts([{ kind: "source_address", value: "203.0.113.7" }]);
      await tx.recordEnrollmentAttempt(
        [
          { kind: "source_address", value: "203.0.113.7" },
          { kind: "register", value: "a-register" },
        ],
        NOW,
      );
    });

    const rows = await db
      .select({
        keyKind: registerEnrollmentAttempts.keyKind,
        keyValue: registerEnrollmentAttempts.keyValue,
        attemptedAt: registerEnrollmentAttempts.attemptedAt,
      })
      .from(registerEnrollmentAttempts);
    expect(rows).toEqual(
      expect.arrayContaining([
        { keyKind: "source_address", keyValue: "203.0.113.7", attemptedAt: minutesAgo(59) },
        { keyKind: "source_address", keyValue: "203.0.113.7", attemptedAt: NOW },
        { keyKind: "register", keyValue: "a-register", attemptedAt: NOW },
        { keyKind: "source_address", keyValue: "198.51.100.1", attemptedAt: minutesAgo(90) },
      ]),
    );
    expect(rows).toHaveLength(4);
  });

  it("adds one failed attempt to each code it is given", async () => {
    const first = await insertRegister("Caja 1");
    const second = await insertRegister("Caja 2");
    await insertCode(first, CODE, { failedAttempts: 1 });
    await insertCode(second, "P4NXAAAAAAAAAAAA", { failedAttempts: 4 });

    await adapterStore().transaction((tx) => tx.recordFailedEnrollmentAttempt([second]));

    const rows = await db
      .select({
        registerId: registerEnrollmentCodes.registerId,
        failedAttempts: registerEnrollmentCodes.failedAttempts,
      })
      .from(registerEnrollmentCodes);
    expect(rows).toEqual(
      expect.arrayContaining([
        { registerId: first, failedAttempts: 1 },
        { registerId: second, failedAttempts: 5 },
      ]),
    );
  });

  it("enrolls through the use case: revokes the register's active installation and redeems the code", async () => {
    const registerId = await insertRegister("Caja 1");
    const otherRegisterId = await insertRegister("Caja 2");
    await insertCode(registerId, CODE);
    const previousId = await insertInstallation(registerId, "previous");
    const otherId = await insertInstallation(otherRegisterId, "other");

    const outcome = await enrollInstallation(
      {
        store: adapterStore(),
        clock: { now: () => NOW },
        tokens: { issue: issueDeviceToken },
        codes: { matches: registerEnrollmentCodeMatches },
      },
      {
        code: CODE,
        sourceAddress: "203.0.113.7",
        hostname: "CAJA-MOSTRADOR",
        windowsVersion: "Windows 11 Pro 10.0.26100",
      },
    );

    if (outcome.kind !== "enrolled") {
      throw new Error(`expected an enrollment, got ${outcome.kind}`);
    }
    const installations = await db.select().from(registerInstallations);
    expect(installations.find((row) => row.id === previousId)?.revokedAt).toEqual(NOW);
    expect(installations.find((row) => row.id === otherId)?.revokedAt).toBeNull();
    expect(installations.find((row) => row.id === outcome.deviceId)).toMatchObject({
      registerId,
      tokenLookupPrefix: outcome.deviceToken.split(".")[0],
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: NOW,
      revokedAt: null,
    });
    expect(JSON.stringify(installations)).not.toContain(outcome.deviceToken);
    const [code] = await db
      .select({ redeemedAt: registerEnrollmentCodes.redeemedAt })
      .from(registerEnrollmentCodes)
      .where(eq(registerEnrollmentCodes.registerId, registerId));
    expect(code?.redeemedAt).toEqual(NOW);
  });
});
