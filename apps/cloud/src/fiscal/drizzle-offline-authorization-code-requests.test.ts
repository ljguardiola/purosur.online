import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleOfflineAuthorizationCodeRequests } from "./drizzle-offline-authorization-code-requests.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const SEPTEMBER_SECOND_HALF = { start: "2026-09-16", end: "2026-09-30" };
const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };

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

async function keepCode(fortnight: { start: string; end: string }) {
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
    acquisition.keep({
      code: { code: "36123456789012", fortnight, reportDeadline: "2026-10-30" },
      obtainedAt: NOW,
      obtainedThrough: "requested",
    }),
  );
}

describe("whether DrizzleOfflineAuthorizationCodeRequests holds a fortnight's offline authorization code", () => {
  it("does not while no code was kept", async () => {
    const requests = new DrizzleOfflineAuthorizationCodeRequests(db);

    expect(await requests.holdsOfflineAuthorizationCodeFor(OCTOBER_FIRST_HALF)).toBe(false);
  });

  it("does once the fortnight's code was kept", async () => {
    await keepCode(OCTOBER_FIRST_HALF);
    const requests = new DrizzleOfflineAuthorizationCodeRequests(db);

    expect(await requests.holdsOfflineAuthorizationCodeFor(OCTOBER_FIRST_HALF)).toBe(true);
  });

  it("does not because another fortnight's code was kept", async () => {
    await keepCode(SEPTEMBER_SECOND_HALF);
    const requests = new DrizzleOfflineAuthorizationCodeRequests(db);

    expect(await requests.holdsOfflineAuthorizationCodeFor(OCTOBER_FIRST_HALF)).toBe(false);
  });
});

describe("whether DrizzleOfflineAuthorizationCodeRequests finds an offline point of sale for the installed register", () => {
  it("does for an installation of a register with one", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    const { deviceId } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });

    const requests = new DrizzleOfflineAuthorizationCodeRequests(db);

    expect(await requests.installedRegisterHasOfflinePointOfSale(deviceId)).toBe(true);
  });

  it("does not for an installation of a register without one, even when another register has one", async () => {
    await seedOfflinePointOfSale(db);
    const { deviceId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 2",
    });

    const requests = new DrizzleOfflineAuthorizationCodeRequests(db);

    expect(await requests.installedRegisterHasOfflinePointOfSale(deviceId)).toBe(false);
  });
});

describe("DrizzleOfflineAuthorizationCodeRequests requesting the offline authorization code", () => {
  it("enqueues the request in a transaction of its own", async () => {
    const enqueue = vi.fn<(transaction: unknown) => Promise<void>>().mockResolvedValue(undefined);

    await new DrizzleOfflineAuthorizationCodeRequests(
      db,
      enqueue,
    ).requestOfflineAuthorizationCode();

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toHaveProperty("execute");
  });

  it("does nothing when the cloud cannot request codes", async () => {
    await expect(
      new DrizzleOfflineAuthorizationCodeRequests(db).requestOfflineAuthorizationCode(),
    ).resolves.toBeUndefined();
  });

  it("reports an enqueue that fails instead of failing, and rolls back what it wrote", async () => {
    const reportError = vi.fn();
    const enqueue = async (transaction: { execute(query: ReturnType<typeof sql>): unknown }) => {
      await transaction.execute(
        sql`insert into caea_codes (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
            values (${OCTOBER_FIRST_HALF.start}, ${OCTOBER_FIRST_HALF.end}, '36123456789012', '2026-10-30', ${NOW.toISOString()}, 'requested')`,
      );
      await transaction.execute(sql`select * from a_table_that_does_not_exist`);
    };

    await expect(
      new DrizzleOfflineAuthorizationCodeRequests(
        db,
        enqueue,
        reportError,
      ).requestOfflineAuthorizationCode(),
    ).resolves.toBeUndefined();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(
      await new DrizzleOfflineAuthorizationCodeRequests(db).holdsOfflineAuthorizationCodeFor(
        OCTOBER_FIRST_HALF,
      ),
    ).toBe(false);
  });
});
