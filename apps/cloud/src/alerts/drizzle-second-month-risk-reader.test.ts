import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleExceptionShareBreachStore } from "../fiscal/drizzle-exception-share-breach-store.js";
import {
  insertFiscalAddress,
  insertRegisterAtFiscalAddress,
} from "../fiscal/test-support/exception-share-fixtures.js";
import {
  insertCaeaDocument,
  insertReceiptRequest,
} from "../fiscal/test-support/issued-document-fixtures.js";
import { arcaVitalityChecks, registerContingencyIntervals } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleSecondMonthRiskReader } from "./drizzle-second-month-risk-reader.js";

const NOW = new Date("2026-11-07T15:00:00.000Z");

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

async function anAddressWithRegister(name: string) {
  const fiscalAddressId = await insertFiscalAddress(db, name);
  const registerId = await insertRegisterAtFiscalAddress(db, fiscalAddressId, `Caja de ${name}`);
  return { fiscalAddressId, registerId };
}

async function recordBreach(fiscalAddressId: string, month: string) {
  await new DrizzleExceptionShareBreachStore(db, () => NOW).transaction(async (transaction) => {
    await transaction.recordBreach({ fiscalAddressId, month, exceptionCount: 2, totalCount: 20 });
  });
}

describe("DrizzleSecondMonthRiskReader.addressesWithRecordedBreach", () => {
  it("answers nothing while no breach was recorded", async () => {
    await expect(
      new DrizzleSecondMonthRiskReader(db).addressesWithRecordedBreach("2026-10"),
    ).resolves.toEqual([]);
  });

  it("answers the id and the name of the fiscal addresses with a breach recorded in that month only", async () => {
    const central = await anAddressWithRegister("Depósito Central");
    const north = await anAddressWithRegister("Local Norte");
    const south = await anAddressWithRegister("Local Sur");
    await recordBreach(central.fiscalAddressId, "2026-10");
    await recordBreach(north.fiscalAddressId, "2026-09");
    await recordBreach(south.fiscalAddressId, "2026-10");
    await recordBreach(south.fiscalAddressId, "2026-09");

    const addresses = await new DrizzleSecondMonthRiskReader(db).addressesWithRecordedBreach(
      "2026-10",
    );

    expect(addresses).toHaveLength(2);
    expect(addresses).toContainEqual({
      fiscalAddressId: central.fiscalAddressId,
      fiscalAddressName: "Depósito Central",
    });
    expect(addresses).toContainEqual({
      fiscalAddressId: south.fiscalAddressId,
      fiscalAddressName: "Local Sur",
    });
  });
});

describe("DrizzleSecondMonthRiskReader.runningCounts", () => {
  it("counts the vouchers of the month of each fiscal address, leaving out other months", async () => {
    const central = await anAddressWithRegister("Depósito Central");
    const north = await anAddressWithRegister("Local Norte");
    await insertCaeaDocument(db, central.registerId, { issuedOn: "2026-11-02" });
    await insertReceiptRequest(db, central.registerId, { issuedOn: "2026-11-03" });
    await insertReceiptRequest(db, central.registerId, { issuedOn: "2026-10-31" });
    await insertReceiptRequest(db, north.registerId, { issuedOn: "2026-11-04" });

    const counts = await new DrizzleSecondMonthRiskReader(db).runningCounts("2026-11");

    expect(counts).toHaveLength(2);
    expect(counts).toContainEqual({
      fiscalAddressId: central.fiscalAddressId,
      exceptionCount: 1,
      totalCount: 2,
    });
    expect(counts).toContainEqual({
      fiscalAddressId: north.fiscalAddressId,
      exceptionCount: 0,
      totalCount: 1,
    });
  });

  it("answers nothing for a month without vouchers", async () => {
    await anAddressWithRegister("Depósito Central");

    await expect(new DrizzleSecondMonthRiskReader(db).runningCounts("2026-11")).resolves.toEqual(
      [],
    );
  });
});

describe("DrizzleSecondMonthRiskReader.fiscalAddresses", () => {
  it("answers nothing while there are no fiscal addresses", async () => {
    await expect(new DrizzleSecondMonthRiskReader(db).fiscalAddresses()).resolves.toEqual([]);
  });

  it("answers the id and the name of every fiscal address", async () => {
    const central = await anAddressWithRegister("Depósito Central");
    const north = await anAddressWithRegister("Local Norte");

    const addresses = await new DrizzleSecondMonthRiskReader(db).fiscalAddresses();

    expect(addresses).toHaveLength(2);
    expect(addresses).toContainEqual({
      fiscalAddressId: central.fiscalAddressId,
      fiscalAddressName: "Depósito Central",
    });
    expect(addresses).toContainEqual({
      fiscalAddressId: north.fiscalAddressId,
      fiscalAddressName: "Local Norte",
    });
  });
});

describe("DrizzleSecondMonthRiskReader.availabilityRuns", () => {
  it("answers the runs of reachability checks of the window", async () => {
    const first = new Date("2026-10-10T12:00:00.000Z");
    const last = new Date("2026-10-10T12:00:30.000Z");
    await db.insert(arcaVitalityChecks).values([
      { checkedAt: first, ok: true },
      { checkedAt: last, ok: true },
    ]);

    await expect(
      new DrizzleSecondMonthRiskReader(db).availabilityRuns({
        from: new Date("2026-10-01T03:00:00.000Z"),
        to: new Date("2026-11-01T03:00:00.000Z"),
      }),
    ).resolves.toEqual([{ ok: true, firstCheckedAt: first, lastCheckedAt: last }]);
  });
});

describe("DrizzleSecondMonthRiskReader.contingencyIntervalsAtFiscalAddress", () => {
  it("answers the contingency of the registers at that fiscal address only", async () => {
    const central = await anAddressWithRegister("Depósito Central");
    const north = await anAddressWithRegister("Local Norte");
    const start = new Date("2026-10-10T12:00:00.000Z");
    const end = new Date("2026-10-10T13:00:00.000Z");
    await db.insert(registerContingencyIntervals).values([
      {
        intervalId: crypto.randomUUID(),
        registerId: central.registerId,
        startedAt: start,
        endedAt: end,
      },
      {
        intervalId: crypto.randomUUID(),
        registerId: north.registerId,
        startedAt: start,
        endedAt: end,
      },
    ]);

    const answer = await new DrizzleSecondMonthRiskReader(db).contingencyIntervalsAtFiscalAddress({
      fiscalAddressId: central.fiscalAddressId,
      from: new Date("2026-10-01T03:00:00.000Z"),
      to: new Date("2026-11-01T03:00:00.000Z"),
    });

    expect(answer.parts).toEqual([{ registerId: central.registerId, start, end }]);
  });
});
