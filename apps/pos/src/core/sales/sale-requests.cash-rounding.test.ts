import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import {
  applySaleDiscountFor,
  cashChargeFor,
  chargeSaleByTransferFor,
  chargeSaleInCashFor,
  chargeSaleOnStandaloneTerminalFor,
  type OutboxSaleRequestDeps,
  type SellingRequestDeps,
  scanProductFor,
} from "./sale-requests";
import { countingIds, openSellingRegister, saleRequestDeps } from "./test-support/sale-requests";

let database: LocalDatabase;
let ids: OutboxSaleRequestDeps["ids"];

function deps(): OutboxSaleRequestDeps & SellingRequestDeps {
  return saleRequestDeps(database, ids);
}

async function sellFor(unitPrice: number): Promise<string> {
  database.exec(`UPDATE prices SET unit_price = ${unitPrice}`);
  const outcome = await scanProductFor(deps(), "111");
  if (outcome.kind !== "added") {
    throw new Error("test setup: the product was not added");
  }
  return outcome.sale.id;
}

function completedEvent() {
  const row = database
    .prepare<[], { schema_version: number; payload: string }>(
      "SELECT schema_version, payload FROM outbox WHERE event_type = 'sale_completed'",
    )
    .get();
  if (row === undefined) {
    throw new Error("test setup: no sale was completed");
  }
  const payload = JSON.parse(row.payload) as {
    total: number;
    cash_rounding: number;
    lines: { line_total: number }[];
    payments: { method: string; amount: number }[];
  };
  return {
    schemaVersion: row.schema_version,
    total: payload.total,
    cashRounding: payload.cash_rounding,
    lineTotals: payload.lines.reduce((sum, line) => sum + line.line_total, 0),
    payments: payload.payments.map(({ method, amount }) => ({ method, amount })),
  };
}

beforeEach(() => {
  ids = countingIds();
  database = openSellingRegister();
});

afterEach(() => {
  database.close();
});

describe("charging a sale in cash on the register", () => {
  it("charges a $3.270 sale as $3.200 in cash, recording the $70 rounding in the sale and its event", async () => {
    const saleId = await sellFor(327_000);

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 500_000 })).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 320_000,
      tendered: 500_000,
      change: 180_000,
      cash_rounding: 7000,
    });
    expect(
      database.prepare("SELECT state, cash_rounding FROM sales WHERE id = ?").all(saleId),
    ).toEqual([{ state: "COMPLETED", cash_rounding: 7000 }]);
    expect(database.prepare("SELECT amount, tendered FROM payment_transactions").all()).toEqual([
      { amount: 320_000, tendered: 500_000 },
    ]);
    expect(completedEvent()).toEqual({
      schemaVersion: 11,
      total: 320_000,
      cashRounding: 7000,
      lineTotals: 320_000,
      payments: [{ method: "CASH", amount: 320_000 }],
    });
  });

  it("rounds only the cash that pays off the rest of a sale already paid in part by another method", async () => {
    const saleId = await sellFor(527_000);
    await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 300_000 });

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 300_000 })).toMatchObject({
      kind: "completed",
      total: 520_000,
      cash_rounding: 7000,
    });
    expect(database.prepare("SELECT method, amount FROM payment_transactions").all()).toEqual([
      { method: "STANDALONE_TERMINAL", amount: 300_000 },
      { method: "CASH", amount: 220_000 },
    ]);
    expect(completedEvent()).toMatchObject({
      total: 520_000,
      cashRounding: 7000,
      lineTotals: 520_000,
    });
  });

  it("does not round a cash payment that leaves part of the sale to pay, so the card pays the exact rest", async () => {
    const saleId = await sellFor(527_000);

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 200_000 })).toMatchObject({
      kind: "partially_paid",
    });
    expect(await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 327_000 })).toEqual({
      kind: "completed",
      sale_id: saleId,
      total: 527_000,
    });
    expect(completedEvent()).toMatchObject({ total: 527_000, cashRounding: 0 });
  });

  it("does not round a sale paid by transfer", async () => {
    const saleId = await sellFor(327_000);

    await chargeSaleByTransferFor(deps(), { saleId, amount: 327_000 });

    expect(completedEvent()).toMatchObject({ total: 327_000, cashRounding: 0 });
  });

  it("leaves a total that is already a multiple of $100 as it is", async () => {
    const saleId = await sellFor(320_000);

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 320_000 })).toMatchObject({
      kind: "completed",
      total: 320_000,
      cash_rounding: 0,
    });
    expect(database.prepare("SELECT cash_rounding FROM sales").all()).toEqual([
      { cash_rounding: 0 },
    ]);
  });

  it("charges a sale under $100 exactly", async () => {
    const saleId = await sellFor(8000);

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 10_000 })).toMatchObject({
      kind: "completed",
      total: 8000,
      change: 2000,
      cash_rounding: 0,
    });
  });

  it("charges exactly the $80 left after a card payment", async () => {
    const saleId = await sellFor(18_000);
    await chargeSaleOnStandaloneTerminalFor(deps(), { saleId, amount: 10_000 });

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 8000 })).toMatchObject({
      kind: "completed",
      total: 18_000,
      cash_rounding: 0,
    });
  });

  it("rounds after a manual discount on the total, keeping both on the sale and its event", async () => {
    database.exec(
      "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'apply_total_discount', 1)",
    );
    const saleId = await sellFor(337_000);
    await applySaleDiscountFor(deps(), {
      discount: { kind: "AMOUNT", value: 10_000 },
      reason: "Cliente frecuente",
    });

    expect(await chargeSaleInCashFor(deps(), { saleId, tendered: 400_000 })).toMatchObject({
      kind: "completed",
      total: 320_000,
      cash_rounding: 7000,
    });
    expect(database.prepare("SELECT sale_discount_value, cash_rounding FROM sales").all()).toEqual([
      { sale_discount_value: 10_000, cash_rounding: 7000 },
    ]);
    expect(completedEvent()).toMatchObject({
      total: 320_000,
      cashRounding: 7000,
      lineTotals: 320_000,
    });
  });

  it("hands the fiscal document the rounded total", async () => {
    const saleId = await sellFor(327_000);

    await chargeSaleInCashFor(deps(), { saleId, tendered: 500_000 });

    expect(database.prepare("SELECT total FROM deferred_sales").all()).toEqual([
      { total: 320_000 },
    ]);
  });
});

describe("what a sale needs when an amount is tendered in cash", () => {
  it("answers the rounding, the amount to charge and the change of $5.000 tendered on $3.270", async () => {
    const saleId = await sellFor(327_000);

    expect(await cashChargeFor(deps(), { saleId, tendered: 500_000 })).toEqual({
      kind: "covered",
      applied: 320_000,
      change: 180_000,
      cash_rounding: 7000,
    });
  });

  it("answers the rounding of the total the typed 'Falta de cambio' discount leaves", async () => {
    const saleId = await sellFor(337_000);

    expect(
      await cashChargeFor(deps(), { saleId, tendered: 500_000, saleDiscount: 10_000 }),
    ).toEqual({ kind: "covered", applied: 320_000, change: 180_000, cash_rounding: 7000 });
  });

  it("answers the rounding of only what is still pending once a payment was approved", async () => {
    const saleId = await sellFor(527_000);
    await chargeSaleByTransferFor(deps(), { saleId, amount: 300_000 });

    expect(await cashChargeFor(deps(), { saleId, tendered: 300_000 })).toEqual({
      kind: "covered",
      applied: 220_000,
      change: 80_000,
      cash_rounding: 7000,
    });
  });

  it("changes nothing in the sale", async () => {
    const saleId = await sellFor(327_000);

    await cashChargeFor(deps(), { saleId, tendered: 500_000 });

    expect(database.prepare("SELECT state, cash_rounding FROM sales").all()).toEqual([
      { state: "OPEN", cash_rounding: 0 },
    ]);
  });
});
