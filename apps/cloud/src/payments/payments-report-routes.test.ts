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
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerPaymentsReportRoutes } from "./payments-report-routes.js";

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
  registerPaymentsReportRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function salesByPaymentMethod(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/sales-by-payment-method${query}`, headers });
}

async function receiveSale(method: "CASH" | "QR", amount: number) {
  const installation = await insertEnrolledInstallation(db, {
    now: NOW,
    registerName: "Caja 1",
  });
  await applyCompletedSale(db, {
    deviceId: installation.deviceId,
    completedAt: new Date("2026-10-07T14:00:00.000Z"),
    total: amount,
    overrides: {
      payments: [
        {
          id: randomUUID(),
          method,
          provider: method === "QR" ? "MERCADOPAGO_QR" : "NONE",
          amount,
          tendered: null,
          state: "APPROVED",
          occurredAt: new Date("2026-10-07T14:00:00.000Z"),
          authorizedBy: null,
          confirmedAt: null,
        },
      ],
    },
  });
  return installation;
}

describe("GET /reports/sales-by-payment-method access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await salesByPaymentMethod({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByPaymentMethod({
      ...headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await salesByPaymentMethod(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByPaymentMethod(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/sales-by-payment-method", () => {
  it.each([
    ["a range ending before it starts", "?from=2026-10-06&to=2026-10-05"],
    ["a parameter given twice", "?from=2026-10-01&from=2026-10-02&to=2026-10-03"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByPaymentMethod(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await salesByPaymentMethod(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      methods: [],
      totals: { sales_count: 0, total: 0, average_ticket: null },
    });
  });

  it("reports each method of the applied sales with the totals of the range", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    await receiveSale("QR", 4_800);

    const response = await salesByPaymentMethod(headers, "?from=2026-10-07&to=2026-10-07");

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      methods: [{ method: "QR", sales_count: 1, amount: 4_800 }],
      totals: { sales_count: 1, total: 4_800, average_ticket: 4_800 },
    });
  });

  it("filters by an asked register of the branch", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const { registerId } = await receiveSale("CASH", 4_800);

    const ofTheRegister = await salesByPaymentMethod(headers, `?register_id=${registerId}`);
    const ofAnotherRegister = await salesByPaymentMethod(headers, `?register_id=${randomUUID()}`);

    expect(ofTheRegister.json().totals.sales_count).toBe(1);
    expect(ofAnotherRegister.json().totals.sales_count).toBe(0);
  });

  it("reports the branch of the session and never another", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["view_reports"], NOW, {
      locationId: otherLocationId,
    });
    await receiveSale("CASH", 4_800);

    const response = await salesByPaymentMethod(headers);

    expect(response.json().totals.sales_count).toBe(0);
  });
});

function handConfirmedPayments(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/hand-confirmed-payments${query}`, headers });
}

async function receiveTransfer(amount: number) {
  const installation = await insertEnrolledInstallation(db, {
    now: NOW,
    registerName: "Caja 1",
  });
  await applyCompletedSale(db, {
    deviceId: installation.deviceId,
    completedAt: new Date("2026-10-07T14:00:00.000Z"),
    total: amount,
    overrides: {
      payments: [
        {
          id: randomUUID(),
          method: "TRANSFER",
          provider: "NONE",
          amount,
          tendered: null,
          state: "APPROVED",
          occurredAt: new Date("2026-10-07T14:00:00.000Z"),
          authorizedBy: randomUUID(),
          confirmedAt: new Date("2026-10-07T14:05:00.000Z"),
        },
      ],
    },
  });
  return installation;
}

describe("GET /reports/hand-confirmed-payments access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await handConfirmedPayments({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await handConfirmedPayments({
      ...headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await handConfirmedPayments(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await handConfirmedPayments(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/hand-confirmed-payments", () => {
  it.each([
    ["a range ending before it starts", "?from=2026-10-06&to=2026-10-05"],
    ["a method that is not confirmed by hand", "?method=CASH"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await handConfirmedPayments(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day with every method at zero when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await handConfirmedPayments(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-07", to: "2026-10-07" },
      totals: { count: 0, amount: 0 },
      methods: [
        { method: "TRANSFER", count: 0, amount: 0 },
        { method: "STANDALONE_TERMINAL", count: 0, amount: 0 },
      ],
      cashiers: [],
      payments: [],
    });
  });

  it("reports the payments confirmed by hand with their reconciliation", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    await receiveTransfer(4_800);

    const response = await handConfirmedPayments(headers, "?from=2026-10-07&to=2026-10-07");

    expect(response.json()).toMatchObject({
      range: { from: "2026-10-07", to: "2026-10-07" },
      totals: { count: 1, amount: 4_800 },
      methods: [
        { method: "TRANSFER", count: 1, amount: 4_800 },
        { method: "STANDALONE_TERMINAL", count: 0, amount: 0 },
      ],
      payments: [
        {
          method: "TRANSFER",
          amount: 4_800,
          confirmed_at: "2026-10-07T14:05:00.000Z",
          cashier_name: null,
          confirmed_by_name: null,
          sale_operation_number: null,
        },
      ],
    });
  });

  it("reports the branch of the session and never another", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["view_reports"], NOW, {
      locationId: otherLocationId,
    });
    await receiveTransfer(4_800);

    const response = await handConfirmedPayments(headers);

    expect(response.json().totals.count).toBe(0);
  });
});
