import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCompletedSale } from "../sales/test-support/applied-sales.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { applySyncedEventsTask } from "../sync/apply-synced-events-task.js";
import { insertInboxEvent } from "../sync/test-support/inbox-events.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerIssuedFiscalDocumentsRoute } from "./issued-fiscal-documents-route.js";
import {
  insertCompletedSale,
  insertOnlineCreditNote,
  insertReceiptRequest,
  insertRegisterOf,
  insertSalePayment,
  insertSoldLine,
} from "./test-support/issued-document-fixtures.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");

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
  registerIssuedFiscalDocumentsRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    zoneRules: fixedZoneRulesSource(),
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function documents(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/fiscal/documents${query}`, headers });
}

describe("GET /fiscal/documents access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await documents({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await documents({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view fiscal documents, even one who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await documents(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view fiscal documents", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await documents(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /fiscal/documents", () => {
  it.each([
    ["a range ending before it starts", "?from=2026-10-06&to=2026-10-05"],
    ["a kind that is neither", "?kind=invoice"],
    ["a page of zero", "?page=0"],
    ["a parameter given twice", "?kind=receipt&kind=credit_note"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await documents(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("lists the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await documents(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      documents: [],
      total: 0,
      page_size: 50,
    });
  });

  it("lists a receipt and the credit note issued against it as separate entries", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);
    const { registerId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
    });
    await insertReceiptRequest(db, registerId, {
      pointOfSale: 7,
      number: 12,
      issuedOn: "2026-10-05",
    });
    await insertOnlineCreditNote(db, registerId, {
      pointOfSale: 7,
      number: 3,
      associatedPointOfSale: 7,
      associatedNumber: 12,
      issuedOn: "2026-10-06",
    });

    const response = await documents(headers, "?from=2026-10-01&to=2026-10-07");

    expect(response.json()).toMatchObject({
      total: 2,
      documents: [
        {
          kind: "credit_note",
          voucher_type: 13,
          number: 3,
          corrected_voucher: { voucher_type: 11, point_of_sale: 7, number: 12 },
        },
        { kind: "receipt", voucher_type: 11, number: 12, corrected_voucher: null },
      ],
    });
  });

  it("answers each document with the shape of the contract", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);
    const { registerId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
    });
    await insertReceiptRequest(db, registerId, {
      pointOfSale: 7,
      number: 12,
      issuedOn: "2026-10-05",
      receivedAt: new Date("2026-10-05T13:00:00.000Z"),
      total: 4_800,
    });

    const response = await documents(headers, "?from=2026-10-05&to=2026-10-05");

    expect(response.json()).toEqual({
      range: { from: "2026-10-05", to: "2026-10-05" },
      documents: [
        {
          kind: "receipt",
          voucher_type: 11,
          point_of_sale: 7,
          number: 12,
          issued_on: "2026-10-05",
          issued_at: "2026-10-05T13:00:00.000Z",
          register: { id: registerId, name: "Caja 1" },
          authorization: { kind: "cae", code: "75123456789012", due_on: "2026-10-15" },
          state: "authorized",
          contingency: false,
          total: 4_800,
          corrected_voucher: null,
        },
      ],
      total: 1,
      page_size: 50,
    });
  });

  it("applies the asked register, kind, voucher number and page", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);
    const { registerId } = await insertEnrolledInstallation(db, { now: NOW });
    await insertReceiptRequest(db, registerId, { number: 21 });
    await insertReceiptRequest(db, registerId, { number: 22 });
    await insertOnlineCreditNote(db, registerId, { number: 22 });

    const byNumber = await documents(
      headers,
      `?from=2026-10-01&to=2026-10-31&register_id=${registerId}&kind=receipt&number=22`,
    );
    const ofAnotherRegister = await documents(
      headers,
      `?from=2026-10-01&to=2026-10-31&register_id=${randomUUID()}`,
    );
    const beyondLastPage = await documents(headers, "?from=2026-10-01&to=2026-10-31&page=2");

    expect(byNumber.json().documents.map((d: { number: number }) => d.number)).toEqual([22]);
    expect(ofAnotherRegister.json().total).toBe(0);
    expect(beyondLastPage.json()).toMatchObject({ documents: [], total: 3 });
  });

  it("lists only the documents of the branch of the session", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);
    const { registerId } = await insertEnrolledInstallation(db, { now: NOW });
    const otherRegister = await insertRegisterOf(db, await insertLocation(db), "Caja X");
    await insertReceiptRequest(db, registerId, { number: 31 });
    await insertReceiptRequest(db, otherRegister, { number: 32 });

    const response = await documents(headers, "?from=2026-10-01&to=2026-10-31");

    expect(response.json().documents.map((d: { number: number }) => d.number)).toEqual([31]);
  });

  it("includes a document issued under a pre-obtained code once its event is applied", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);
    const { deviceId, registerId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
    });
    const saleId = await applyCompletedSale(db, {
      deviceId,
      completedAt: new Date("2026-10-06T11:20:00.000Z"),
      total: 4_800,
    });
    await insertInboxEvent(db, deviceId, {
      aggregateType: "Sale",
      aggregateId: saleId,
      eventType: "offline_fiscal_document_issued",
      schemaVersion: 1,
      payload: {
        fiscal_document_id: randomUUID(),
        sale_id: saleId,
        register_id: registerId,
        point_of_sale: 8,
        document_type: "factura_c",
        number: 5,
        issued_on: "2026-10-06",
        generated_at: "2026-10-06T11:20:00.000Z",
        generation_stamp: "20261006082000",
        offline_authorization_code: "21403471111111",
        fortnight_start: "2026-10-01",
        fortnight_end: "2026-10-15",
        buyer_document_type: 99,
        buyer_document_number: 0,
        buyer_tax_status_code: 5,
        total: 4800,
        net_amount: 4800,
        cause: "no_connectivity",
      },
      receivedAt: new Date("2026-10-06T11:20:05.000Z"),
    });

    const before = await documents(headers, "?from=2026-10-06&to=2026-10-06");
    await applySyncedEventsTask(db, { zoneRules: fixedZoneRulesSource(), now: () => NOW });
    const after = await documents(headers, "?from=2026-10-06&to=2026-10-06");

    expect(before.json().total).toBe(0);
    expect(after.json()).toMatchObject({
      total: 1,
      documents: [
        {
          kind: "receipt",
          point_of_sale: 8,
          number: 5,
          register: { id: registerId },
          contingency: true,
          authorization: {
            kind: "caea",
            code: "21403471111111",
            fortnight_start: "2026-10-01",
            fortnight_end: "2026-10-15",
          },
        },
      ],
    });
  });
});

function documentDetail(headers: Record<string, string>, voucher = "11/7/12") {
  return app.inject({ method: "GET", url: `/fiscal/documents/${voucher}`, headers });
}

describe("GET /fiscal/documents/:voucher_type/:point_of_sale/:number", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await documentDetail({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await documentDetail({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view fiscal documents, even one who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { registerId } = await insertEnrolledInstallation(db, { now: NOW });
    await insertReceiptRequest(db, registerId, { pointOfSale: 7, number: 12 });

    const response = await documentDetail(headers);

    expect(response.statusCode).toBe(403);
  });

  it.each([
    ["a voucher type with letters", "abc/7/12"],
    ["a point of sale of zero", "11/0/12"],
    ["a point of sale above the largest", "11/100000/12"],
    ["a number of zero", "11/7/0"],
  ])("answers 400 to %s", async (_name, voucher) => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await documentDetail(headers, voucher);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("answers 404 to a voucher that was never issued", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await documentDetail(headers, "11/7/99");

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 404 to a voucher issued by another branch", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);
    const otherRegister = await insertRegisterOf(db, await insertLocation(db), "Caja 9");
    await insertReceiptRequest(db, otherRegister, { pointOfSale: 7, number: 12 });

    const response = await documentDetail(headers);

    expect(response.statusCode).toBe(404);
  });

  it("answers the detail of a receipt with the shape of the contract", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);
    const { registerId, deviceId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
    });
    const saleId = randomUUID();
    await insertCompletedSale(db, { saleId, registerId, deviceId, at: NOW });
    await insertSoldLine(db, saleId, { productName: "Yerba 1 kg", quantity: 2, lineTotal: 3_000 });
    await insertSoldLine(db, saleId, {
      productName: "Queso cremoso",
      quantity: 450,
      weightSource: "SCALE",
      lineTotal: 1_800,
    });
    await insertSalePayment(db, saleId, { amount: 4_800 });
    await insertReceiptRequest(db, registerId, {
      saleId,
      pointOfSale: 7,
      number: 12,
      issuedOn: "2026-10-05",
      receivedAt: new Date("2026-10-05T13:00:00.000Z"),
      total: 4_800,
    });
    await insertOnlineCreditNote(db, registerId, {
      pointOfSale: 7,
      number: 3,
      associatedNumber: 12,
      issuedOn: "2026-10-06",
      requestedAt: new Date("2026-10-06T14:00:00.000Z"),
      total: 1_800,
    });

    const response = await documentDetail(headers);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.lines).toHaveLength(2);
    expect(body).toEqual({
      kind: "receipt",
      voucher_type: 11,
      point_of_sale: 7,
      number: 12,
      issued_on: "2026-10-05",
      issued_at: "2026-10-05T13:00:00.000Z",
      register: { id: registerId, name: "Caja 1" },
      authorization: { kind: "cae", code: "75123456789012", due_on: "2026-10-15" },
      state: "authorized",
      contingency: false,
      total: 4_800,
      corrected_voucher: null,
      buyer: { kind: "final_consumer" },
      lines: expect.arrayContaining([
        {
          product_name: "Yerba 1 kg",
          quantity: { kind: "units", units: 2 },
          promotion: null,
          amount: 3_000,
        },
        {
          product_name: "Queso cremoso",
          quantity: { kind: "weight", grams: 450 },
          promotion: null,
          amount: 1_800,
        },
      ]),
      payments: [{ method: "CASH", card_type: null, amount: 4_800 }],
      credit_notes: [
        expect.objectContaining({
          kind: "credit_note",
          voucher_type: 13,
          number: 3,
          corrected_voucher: { voucher_type: 11, point_of_sale: 7, number: 12 },
        }),
      ],
    });
  });

  it("answers the detail of a credit note naming the receipt it corrects", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);
    const { registerId } = await insertEnrolledInstallation(db, { now: NOW });
    await insertOnlineCreditNote(db, registerId, {
      pointOfSale: 7,
      number: 3,
      associatedNumber: 12,
    });

    const response = await documentDetail(headers, "13/7/3");

    expect(response.json()).toMatchObject({
      kind: "credit_note",
      corrected_voucher: { voucher_type: 11, point_of_sale: 7, number: 12 },
      credit_notes: [],
    });
  });
});
