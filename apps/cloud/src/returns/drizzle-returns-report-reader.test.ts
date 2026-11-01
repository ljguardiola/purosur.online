import { randomUUID } from "node:crypto";
import { syncedEventUpcaster } from "@purosur/contracts";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertCaeaDocument,
  insertReceiptRequest,
} from "../fiscal/test-support/issued-document-fixtures.js";
import { registers, sales, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCompletedSale, applyVoidedSale } from "../sales/test-support/applied-sales.js";
import { aSoldLine } from "../sales/test-support/sold-lines.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { DrizzleEventApplication } from "../sync/drizzle-event-application.js";
import {
  AMOUNT,
  CASHIER,
  pushSaleThenItsVoiding,
  SUPERVISOR,
} from "../sync/test-support/voided-sale-push.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { DrizzleReturnsReportReader } from "./drizzle-returns-report-reader.js";
import { applyReturn } from "./test-support/applied-returns.js";

const NOW = new Date("2026-10-12T15:00:00.000Z");
const SOLD = new Date("2026-10-01T14:00:00.000Z");
const RETURNED = new Date("2026-10-06T14:00:00.000Z");
const thatDay = { from: "2026-10-06", to: "2026-10-06" };
const productId = randomUUID();

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

const reader = () => new DrizzleReturnsReportReader(db);

async function aRegister(name = "Caja 1", locationId?: string) {
  if (locationId === undefined) {
    return insertEnrolledInstallation(db, { now: NOW, registerName: name });
  }
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return insertEnrolledInstallation(db, { now: NOW, existingRegisterId: register.id });
}

async function aUser(firstName: string, locationId: string): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({ id, firstName, email: `${id}@example.com`, locationId });
  return id;
}

function returnAt(deviceId: string, returnedAt: Date, ticketSource: "QR" | "TYPED" = "QR") {
  return applyReturn(db, {
    deviceId,
    soldAt: SOLD,
    returnedAt,
    saleReturn: { ticketSource },
  });
}

describe("the returns a branch made", () => {
  it("lists a return with its register, people, sale and how the ticket was found", async () => {
    const { deviceId, locationId } = await aRegister("Caja 2");
    const cashier = await aUser("Ana", locationId);
    const authorizer = await aUser("Beto", locationId);
    const { completed, saleReturn } = await applyReturn(db, {
      deviceId,
      soldAt: SOLD,
      returnedAt: RETURNED,
      sale: { actorId: cashier, operationNumber: 41 },
      saleReturn: { actorId: cashier, authorizedBy: authorizer, ticketSource: "TYPED" },
    });

    const records = await reader().returnsMade({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(records).toEqual([
      {
        returnId: saleReturn.id,
        occurredAt: RETURNED,
        ticketSource: "TYPED",
        register: { id: expect.any(String), name: "Caja 2" },
        sale: { id: completed.id, operationNumber: 41, invoice: null },
        cashier: { id: cashier, name: "Ana" },
        authorizer: { id: authorizer, name: "Beto" },
        lines: [expect.objectContaining({ saleLineId: completed.lines[0]?.id })],
      },
    ]);
  });

  it("carries a QR ticket as QR", async () => {
    const { deviceId, locationId } = await aRegister();
    await returnAt(deviceId, RETURNED, "QR");

    const [record] = await reader().returnsMade({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(record?.ticketSource).toBe("QR");
  });

  it("names a person who is no longer known as nobody and has no authorizer when none was needed", async () => {
    const { deviceId, locationId } = await aRegister();
    const { saleReturn } = await returnAt(deviceId, RETURNED);

    const [record] = await reader().returnsMade({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(record).toMatchObject({
      returnId: saleReturn.id,
      cashier: { id: saleReturn.actorId, name: null },
      authorizer: null,
    });
  });

  it("lists each returned line with the name sold, its unit, quantity, reason, disposition and refund", async () => {
    const { deviceId, locationId } = await aRegister();
    const yerba = aSoldLine(productId, "Yerba 1 kg", 2, 4_000);
    const queso = aSoldLine(randomUUID(), "Queso cremoso", 800, 3_200, "SCALE");
    const { saleReturn } = await applyReturn(db, {
      deviceId,
      soldAt: SOLD,
      returnedAt: RETURNED,
      sale: { total: 7_200, lines: [yerba, queso] },
      saleReturn: {
        lines: [
          {
            saleLineId: yerba.id,
            productId: yerba.productId,
            quantity: 1,
            reason: "defective",
            resolution: "refund",
            disposition: "discard",
            refundedAmount: 2_000,
          },
          {
            saleLineId: queso.id,
            productId: queso.productId,
            quantity: 300,
            reason: "change_of_mind",
            resolution: "refund",
            disposition: "restock",
            refundedAmount: 1_200,
          },
        ],
      },
    });

    const [record] = await reader().returnsMade({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(record?.returnId).toBe(saleReturn.id);
    expect(record?.lines).toHaveLength(2);
    expect(record?.lines).toEqual(
      expect.arrayContaining([
        {
          saleLineId: yerba.id,
          productName: "Yerba 1 kg",
          saleUnit: "UNIT",
          quantity: 1,
          reason: "defective",
          disposition: "discard",
          resolution: "refund",
          refunded: 2_000,
        },
        {
          saleLineId: queso.id,
          productName: "Queso cremoso",
          saleUnit: "KG",
          quantity: 300,
          reason: "change_of_mind",
          disposition: "restock",
          resolution: "refund",
          refunded: 1_200,
        },
      ]),
    );
  });

  it("reports a line the customer exchanged as an exchange that refunded nothing", async () => {
    const { deviceId, locationId } = await aRegister();
    const yerba = aSoldLine(productId, "Yerba 1 kg", 2, 4_000);
    await applyReturn(db, {
      deviceId,
      soldAt: SOLD,
      returnedAt: RETURNED,
      sale: { total: 4_000, lines: [yerba] },
      saleReturn: {
        lines: [
          {
            saleLineId: yerba.id,
            productId: yerba.productId,
            quantity: 1,
            reason: "defective",
            resolution: "exchange",
            disposition: "discard",
            refundedAmount: 0,
          },
        ],
      },
    });

    const [record] = await reader().returnsMade({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(record?.lines).toEqual([
      expect.objectContaining({ saleLineId: yerba.id, resolution: "exchange", refunded: 0 }),
    ]);
  });

  it("does not list the returns of another branch", async () => {
    const here = await aRegister();
    const elsewhere = await aRegister("Caja otra", await insertLocation(db));
    await returnAt(elsewhere.deviceId, RETURNED);
    const { saleReturn } = await returnAt(here.deviceId, RETURNED);

    const records = await reader().returnsMade({
      locationId: here.locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(records.map((record) => record.returnId)).toEqual([saleReturn.id]);
  });

  it("lists only the returns of the register asked for", async () => {
    const first = await aRegister("Caja 1");
    const second = await aRegister("Caja 2", first.locationId);
    await returnAt(first.deviceId, RETURNED);
    const { saleReturn } = await returnAt(second.deviceId, RETURNED);

    const records = await reader().returnsMade({
      locationId: first.locationId,
      range: thatDay,
      registerId: second.registerId,
    });

    expect(records.map((record) => record.returnId)).toEqual([saleReturn.id]);
  });

  it.each([
    ["23:30 in Argentina on the last day", "2026-10-07T02:30:00.000Z", true],
    ["00:10 in Argentina the day after the range", "2026-10-07T03:10:00.000Z", false],
    ["00:10 in Argentina on the first day", "2026-10-06T03:10:00.000Z", true],
    ["23:30 in Argentina the day before the range", "2026-10-06T02:30:00.000Z", false],
  ])("treats a return at %s by the Argentine calendar day", async (_name, moment, listed) => {
    const { deviceId, locationId } = await aRegister();
    await returnAt(deviceId, new Date(moment));

    const records = await reader().returnsMade({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(records).toHaveLength(listed ? 1 : 0);
  });
});

describe("the invoice of the returned sale", () => {
  async function invoiceOfReturnedSale(
    prepare: (registerId: string, saleId: string) => Promise<void>,
  ) {
    const { deviceId, locationId, registerId } = await aRegister();
    const { completed } = await returnAt(deviceId, RETURNED);
    await prepare(registerId, completed.id);
    const [record] = await reader().returnsMade({
      locationId,
      range: thatDay,
      registerId: undefined,
    });
    return record?.sale.invoice;
  }

  it("is the authorized invoice requested for the sale", async () => {
    const invoice = await invoiceOfReturnedSale((registerId, saleId) =>
      insertReceiptRequest(db, registerId, { saleId, pointOfSale: 7, number: 312 }),
    );

    expect(invoice).toEqual({ pointOfSale: 7, number: 312 });
  });

  it("is the invoice generated offline for the sale", async () => {
    const invoice = await invoiceOfReturnedSale((registerId, saleId) =>
      insertCaeaDocument(db, registerId, { saleId, pointOfSale: 8, number: 55 }),
    );

    expect(invoice).toEqual({ pointOfSale: 8, number: 55 });
  });

  it("is the invoice adopted after an unclear answer", async () => {
    const invoice = await invoiceOfReturnedSale((registerId, saleId) =>
      insertReceiptRequest(db, registerId, {
        saleId,
        pointOfSale: 7,
        number: 313,
        answerKind: "unclear",
        authorizationCode: null,
        authorizationCodeDueOn: null,
        unclearCodes: [1],
        decision: "adopted",
        decidedAt: NOW,
        adoptedAuthorizationCode: "75123456789999",
        adoptedAuthorizationCodeDueOn: "2026-10-15",
      }),
    );

    expect(invoice).toEqual({ pointOfSale: 7, number: 313 });
  });

  it("is none when the sale has no invoice", async () => {
    expect(await invoiceOfReturnedSale(async () => {})).toBeNull();
  });

  it("is none while the invoice has not been authorized", async () => {
    const invoice = await invoiceOfReturnedSale((registerId, saleId) =>
      insertReceiptRequest(db, registerId, {
        saleId,
        answerKind: null,
        authorizationCode: null,
        authorizationCodeDueOn: null,
        answeredAt: null,
      }),
    );

    expect(invoice).toBeNull();
  });
});

describe("the sales voided in a branch", () => {
  const VOIDED = RETURNED;

  function voidAt(
    deviceId: string,
    voidedAt: Date,
    completed: Parameters<typeof applyVoidedSale>[1]["completed"] = {},
  ) {
    return applyVoidedSale(db, { deviceId, completedAt: SOLD, voidedAt, completed });
  }

  it("lists a voided sale with its register, its voider, its authorizer, its invoice and the amount it refunded", async () => {
    const { deviceId, locationId, registerId } = await aRegister("Caja 2");
    const seller = await aUser("Sofi", locationId);
    const voider = await aUser("Ana", locationId);
    const authorizer = await aUser("Beto", locationId);
    const voided = await applyVoidedSale(db, {
      deviceId,
      completedAt: SOLD,
      voidedAt: VOIDED,
      completed: { actorId: seller, operationNumber: 41, total: 7_200 },
      voided: { authorizedBy: authorizer },
      voidedBy: voider,
    });
    await insertReceiptRequest(db, registerId, {
      saleId: voided.id,
      pointOfSale: 7,
      number: 312,
    });

    const records = await reader().salesVoided({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(records).toEqual([
      {
        sale: { id: voided.id, operationNumber: 41, invoice: { pointOfSale: 7, number: 312 } },
        voidedAt: VOIDED,
        register: { id: registerId, name: "Caja 2" },
        cashier: { id: voider, name: "Ana" },
        authorizer: { id: authorizer, name: "Beto" },
        total: 7_200,
      },
    ]);
  });

  it("names the person who voided it, not the seller", async () => {
    const { deviceId, locationId } = await aRegister();
    const seller = await aUser("Sofi", locationId);
    const voider = await aUser("Ana", locationId);
    await applyVoidedSale(db, {
      deviceId,
      completedAt: SOLD,
      voidedAt: VOIDED,
      completed: { actorId: seller },
      voidedBy: voider,
    });

    const [record] = await reader().salesVoided({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(record?.cashier).toEqual({ id: voider, name: "Ana" });
  });

  it("names a person who is no longer known as nobody", async () => {
    const { deviceId, locationId } = await aRegister();
    const { authorizedBy } = await voidAt(deviceId, VOIDED);

    const [record] = await reader().salesVoided({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(record?.authorizer).toEqual({ id: authorizedBy, name: null });
  });

  it("has no cashier when the voiding was applied without knowing who voided it", async () => {
    const { deviceId, locationId } = await aRegister();
    const voided = await voidAt(deviceId, VOIDED);
    await db.update(sales).set({ voidedBy: null }).where(eq(sales.id, voided.id));

    const [record] = await reader().salesVoided({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(record).toMatchObject({ sale: { id: voided.id }, cashier: null });
  });

  it("has no authorizer when the voiding needed none", async () => {
    const { deviceId, locationId } = await aRegister();
    const voided = await applyVoidedSale(db, {
      deviceId,
      completedAt: SOLD,
      voidedAt: VOIDED,
      completed: {},
    });
    await db.update(sales).set({ voidAuthorizedBy: null }).where(eq(sales.id, voided.id));

    const [record] = await reader().salesVoided({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(record?.authorizer).toBeNull();
  });

  it("does not list a sale that was not voided", async () => {
    const { deviceId, locationId } = await aRegister();
    await applyCompletedSale(db, { deviceId, completedAt: VOIDED, total: 1_000 });

    const records = await reader().salesVoided({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(records).toEqual([]);
  });

  it("does not list the voided sales of another branch", async () => {
    const here = await aRegister();
    const elsewhere = await aRegister("Caja otra", await insertLocation(db));
    await voidAt(elsewhere.deviceId, VOIDED);
    const mine = await voidAt(here.deviceId, VOIDED);

    const records = await reader().salesVoided({
      locationId: here.locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(records.map((record) => record.sale.id)).toEqual([mine.id]);
  });

  it("lists only the voided sales of the register asked for", async () => {
    const first = await aRegister("Caja 1");
    const second = await aRegister("Caja 2", first.locationId);
    await voidAt(first.deviceId, VOIDED);
    const wanted = await voidAt(second.deviceId, VOIDED);

    const records = await reader().salesVoided({
      locationId: first.locationId,
      range: thatDay,
      registerId: second.registerId,
    });

    expect(records.map((record) => record.sale.id)).toEqual([wanted.id]);
  });

  it.each([
    ["23:30 in Argentina on the last day", "2026-10-07T02:30:00.000Z", true],
    ["00:10 in Argentina the day after the range", "2026-10-07T03:10:00.000Z", false],
    ["00:10 in Argentina on the first day", "2026-10-06T03:10:00.000Z", true],
    ["23:30 in Argentina the day before the range", "2026-10-06T02:30:00.000Z", false],
  ])("treats a voiding at %s by the Argentine calendar day", async (_name, moment, listed) => {
    const { deviceId, locationId } = await aRegister();
    await voidAt(deviceId, new Date(moment));

    const records = await reader().salesVoided({
      locationId,
      range: thatDay,
      registerId: undefined,
    });

    expect(records).toHaveLength(listed ? 1 : 0);
  });

  it("includes a voiding from the moment its event is applied", async () => {
    const { deviceId, locationId } = await aRegister("Caja 3");
    const saleId = randomUUID();
    await pushSaleThenItsVoiding(db, {
      deviceId,
      locationId,
      saleId,
      paymentId: randomUUID(),
      method: "TRANSFER",
      authorizedBy: SUPERVISOR,
    });
    const query = { locationId, range: thatDay, registerId: undefined };

    const before = await reader().salesVoided(query);
    await applyPendingEvents(
      {
        zoneRules: fixedZoneRulesSource(),
        eventApplication: new DrizzleEventApplication(
          db,
          () => NOW,
          async () => {},
        ),
        upcaster: syncedEventUpcaster,
        clock: { now: () => NOW },
        quarantineNotices: { quarantined: () => {} },
      },
      { limit: 10 },
    );
    const after = await reader().salesVoided(query);

    expect(before).toEqual([]);
    expect(after).toEqual([
      expect.objectContaining({
        sale: expect.objectContaining({ id: saleId }),
        register: { id: expect.any(String), name: "Caja 3" },
        cashier: { id: CASHIER, name: "Ada" },
        authorizer: { id: SUPERVISOR, name: null },
        total: AMOUNT,
      }),
    ]);
  });
});
