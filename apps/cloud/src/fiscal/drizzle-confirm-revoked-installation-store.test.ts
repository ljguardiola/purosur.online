import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import { confirmRevokedInstallationUnsynced } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  locations,
  registers,
  revokedInstallationConfirmations,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { DrizzleRegisterEventStreams } from "../sync/drizzle-register-event-streams.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleConfirmRevokedInstallationStore } from "./drizzle-confirm-revoked-installation-store.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import { WITHOUT_CREDIT_NOTES } from "./test-support/rejected-document-remedy-fixtures.js";

const FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const AT = new Date("2026-10-16T12:00:00.000Z");
const ENROLLED_AT = new Date("2026-10-05T12:00:00.000Z");
const REVOKED_AT = new Date("2026-10-10T12:00:00.000Z");

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

async function keepCode(fortnight: Fortnight) {
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
    acquisition.keep({
      code: { code: "36123456789012", fortnight, reportDeadline: "2026-10-20" },
      obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
      obtainedThrough: "requested",
    }),
  );
}

async function revokedInstallationOfTheOfflinePointOfSale() {
  const registerId = await seedOfflinePointOfSale(db);
  await keepCode(FIRST_HALF);
  const { deviceId } = await insertEnrolledInstallation(db, {
    now: AT,
    existingRegisterId: registerId,
    enrolledAt: ENROLLED_AT,
    revokedAt: REVOKED_AT,
  });
  return { registerId, installationId: deviceId };
}

async function actorId() {
  const [actor] = await db.select({ id: users.id }).from(users).limit(1);
  if (!actor) {
    throw new Error("test setup: expected a user");
  }
  return actor.id;
}

async function confirm(
  installationId: string,
  overrides: { locationId?: string; fortnightStart?: string } = {},
) {
  return confirmRevokedInstallationUnsynced(
    {
      store: new DrizzleConfirmRevokedInstallationStore(
        db,
        (tx) => new DrizzleRegisterEventStreams(tx),
      ),
      clock: { now: () => AT },
      zoneRules: fixedZoneRulesSource(),
    },
    {
      locationId: overrides.locationId ?? (await seededLocationId(db)),
      pointOfSaleNumber: 8,
      fortnightStart: overrides.fortnightStart ?? FIRST_HALF.start,
      installationId,
      actorId: await actorId(),
    },
  );
}

const confirmations = () => db.select().from(revokedInstallationConfirmations);

describe("confirming a revoked installation through the Drizzle store", () => {
  it("records the confirmation under the actor and audits it with the register and when the installation was revoked", async () => {
    const { registerId, installationId } = await revokedInstallationOfTheOfflinePointOfSale();

    expect(await confirm(installationId)).toEqual({ kind: "confirmed" });

    const actor = await actorId();
    expect(await confirmations()).toEqual([
      {
        pointOfSaleNumber: 8,
        fortnightStart: FIRST_HALF.start,
        installationId,
        confirmedBy: actor,
        confirmedAt: AT,
      },
    ]);
    expect(
      await db.select().from(auditLog).where(eq(auditLog.entityId, installationId)),
    ).toMatchObject([
      {
        entity: "register_installation",
        actorId: actor,
        at: AT,
        previousValue: null,
        newValue: {
          point_of_sale_number: 8,
          fortnight_start: FIRST_HALF.start,
          fortnight_end: FIRST_HALF.end,
          register_id: registerId,
          revoked_at: REVOKED_AT.toISOString(),
        },
      },
    ]);
  });

  it("answers that the installation was already confirmed the second time", async () => {
    const { installationId } = await revokedInstallationOfTheOfflinePointOfSale();
    await confirm(installationId);

    expect(await confirm(installationId)).toEqual({ kind: "already_confirmed" });
    expect(await confirmations()).toHaveLength(1);
  });

  it("answers that the fortnight was already presented once the report is recorded as accepted", async () => {
    const { installationId } = await revokedInstallationOfTheOfflinePointOfSale();
    await new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(
      { pointOfSaleNumber: 8, fortnight: FIRST_HALF },
      (report) => report.record({ state: "accepted", at: AT }),
    );

    expect(await confirm(installationId)).toEqual({ kind: "already_presented" });
    expect(await confirmations()).toEqual([]);
  });

  it("answers that an installation still active is not revoked while another installation of its register is", async () => {
    const { registerId, installationId: revoked } =
      await revokedInstallationOfTheOfflinePointOfSale();
    const active = await insertEnrolledInstallation(db, {
      now: AT,
      existingRegisterId: registerId,
      enrolledAt: REVOKED_AT,
    });

    expect(await confirm(active.deviceId)).toEqual({ kind: "not_revoked" });
    expect(await confirm(revoked)).toEqual({ kind: "confirmed" });
    expect(await confirmations()).toMatchObject([{ installationId: revoked }]);
  });

  it("finds no installation of a register that does not own the point of sale", async () => {
    await revokedInstallationOfTheOfflinePointOfSale();
    const other = await insertEnrolledInstallation(db, {
      now: AT,
      registerName: "Caja 2",
      enrolledAt: ENROLLED_AT,
      revokedAt: REVOKED_AT,
    });

    expect(await confirm(other.deviceId)).toEqual({ kind: "not_found" });
    expect(await confirmations()).toEqual([]);
  });

  it("finds no installation of a register of another branch", async () => {
    const { registerId, installationId } = await revokedInstallationOfTheOfflinePointOfSale();
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    await db
      .update(registers)
      .set({ locationId: otherLocation?.id as string })
      .where(eq(registers.id, registerId));

    expect(await confirm(installationId)).toEqual({ kind: "not_found" });
    expect(await confirmations()).toEqual([]);
  });

  it("finds no installation for a fortnight the tax authority granted no code for", async () => {
    const { installationId } = await revokedInstallationOfTheOfflinePointOfSale();

    expect(await confirm(installationId, { fortnightStart: SECOND_HALF.start })).toEqual({
      kind: "not_found",
    });
    expect(await confirmations()).toEqual([]);
  });

  it("finds no installation that does not exist", async () => {
    await revokedInstallationOfTheOfflinePointOfSale();

    expect(await confirm("0199b7a0-0000-7000-8000-0000000000ff")).toEqual({ kind: "not_found" });
  });
});
