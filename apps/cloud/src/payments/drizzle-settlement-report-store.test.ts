import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  mercadoPagoSettlementMovements,
  mercadoPagoSettlementReportRequests,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleSettlementReportStore } from "./drizzle-settlement-report-store.js";
import { settlementRow } from "./test-support/settlement-movement-fixtures.js";

const DAY = "2026-10-09";
const REQUESTED_AT = new Date("2026-10-09T15:00:00.000Z");
const RECORDED_AT = new Date("2026-10-09T18:00:00.000Z");
const LATER = new Date("2026-10-10T18:00:00.000Z");

const request = {
  day: DAY,
  beginDate: new Date("2026-08-10T03:00:00.000Z"),
  endDate: new Date("2026-10-09T03:00:00.000Z"),
  requestedAt: REQUESTED_AT,
};

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

const store = () => new DrizzleSettlementReportStore(db);

describe("DrizzleSettlementReportStore requests", () => {
  it("answers nothing for a day with no request", async () => {
    expect(await store().requestOfDay(DAY)).toBeNull();
  });

  it("answers the request recorded for the day, neither refused nor recorded", async () => {
    await store().recordRequest(request);

    expect(await store().requestOfDay(DAY)).toEqual({
      ...request,
      refused: false,
      recordedAt: null,
    });
  });

  it("marks the request of the day refused", async () => {
    await store().recordRequest(request);
    await store().recordRequest({ ...request, day: "2026-10-10" });

    await store().recordRefusal(DAY);

    expect(await store().requestOfDay(DAY)).toMatchObject({ refused: true });
    expect(await store().requestOfDay("2026-10-10")).toMatchObject({ refused: false });
  });

  it("replaces the request of a day when it is requested again", async () => {
    await store().recordRequest(request);
    await store().recordRefusal(DAY);
    await store().recordRequest({ ...request, requestedAt: LATER });

    expect(await store().requestOfDay(DAY)).toEqual({
      ...request,
      requestedAt: LATER,
      refused: false,
      recordedAt: null,
    });
    expect(await db.select().from(mercadoPagoSettlementReportRequests)).toHaveLength(1);
  });
});

describe("DrizzleSettlementReportStore.recordRows", () => {
  it("stores every row and marks the day's request as recorded", async () => {
    await store().recordRequest(request);

    await store().recordRows(
      DAY,
      [
        settlementRow({ externalReference: "ABC" }),
        settlementRow({ transactionType: "REFUND", netAmount: -9_460, grossAmount: -10_000 }),
      ],
      RECORDED_AT,
    );

    const stored = await db.select().from(mercadoPagoSettlementMovements);
    expect(stored.map((row) => row.transactionType).sort()).toEqual(["REFUND", "SETTLEMENT"]);
    expect(stored.find((row) => row.transactionType === "SETTLEMENT")).toMatchObject({
      sourceId: "PAY1",
      externalReference: "ABC",
      paymentMethod: "master",
      paymentMethodType: "credit_card",
      grossAmount: 10_000,
      feeAmount: -450,
      taxesAmount: -90,
      netAmount: 9_460,
      recordedAt: RECORDED_AT,
    });
    expect(await store().requestOfDay(DAY)).toMatchObject({ recordedAt: RECORDED_AT });
  });

  it("replaces the figures of a movement a later report repeats", async () => {
    await store().recordRequest(request);
    await store().recordRows(DAY, [settlementRow({ moneyReleaseDate: null })], RECORDED_AT);
    const release = new Date("2026-10-23T03:00:00.000Z");

    await store().recordRows(
      DAY,
      [settlementRow({ feeAmount: -500, netAmount: 9_410, moneyReleaseDate: release })],
      LATER,
    );

    const stored = await db.select().from(mercadoPagoSettlementMovements);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      feeAmount: -500,
      netAmount: 9_410,
      moneyReleaseDate: release,
      recordedAt: LATER,
    });
    expect(await store().requestOfDay(DAY)).toMatchObject({ recordedAt: LATER });
  });

  it("keeps the movements an earlier report stored and this one does not repeat", async () => {
    await store().recordRequest(request);
    await store().recordRows(DAY, [settlementRow({ sourceId: "PAY1" })], RECORDED_AT);

    await store().recordRows(DAY, [settlementRow({ sourceId: "PAY2" })], LATER);

    const stored = await db.select().from(mercadoPagoSettlementMovements);
    expect(stored.map((row) => row.sourceId).sort()).toEqual(["PAY1", "PAY2"]);
  });

  it("stores nothing when the day has no request to mark", async () => {
    await expect(store().recordRows(DAY, [settlementRow()], RECORDED_AT)).rejects.toThrow();
    expect(await db.select().from(mercadoPagoSettlementMovements)).toEqual([]);
  });

  it("leaves other days' requests unmarked", async () => {
    await store().recordRequest(request);
    await store().recordRequest({ ...request, day: "2026-10-10" });

    await store().recordRows(DAY, [], RECORDED_AT);

    const [other] = await db
      .select()
      .from(mercadoPagoSettlementReportRequests)
      .where(eq(mercadoPagoSettlementReportRequests.day, "2026-10-10"));
    expect(other?.recordedAt).toBeNull();
  });
});
