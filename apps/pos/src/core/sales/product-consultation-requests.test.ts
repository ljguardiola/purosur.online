import type { Scale, ScaleReading } from "@purosur/domain/sales/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { consultProductFor } from "./product-consultation-requests";
import {
  openSellingRegister,
  SALE_REQUESTS_NOW,
  saleRequestDeps,
} from "./test-support/sale-requests";
import {
  addBarcode,
  addDiscount,
  addPrice,
  addProduct,
} from "./test-support/sqlite-sale-ledger";

const FRIDAY = 5;

let database: LocalDatabase;

function scaleReading(reading: ScaleReading): Scale {
  return { read: async () => reading };
}

function deps(reading: ScaleReading = { kind: "stable", weightThousandths: 410 }) {
  return { ...saleRequestDeps(database), scale: scaleReading(reading) };
}

beforeEach(() => {
  database = openSellingRegister();
  addProduct(database, undefined, { id: "almendras", name: "Almendras peladas", unit: "KG" });
  addBarcode(database, "almendras", "7790001000017");
  addPrice(database, "almendras", "2026-09-01T00:00:00.000Z", 1_890_000);
  addDiscount(
    database,
    "ten-on-fridays",
    { kind: "PRODUCT", id: "almendras" },
    { kind: "PERCENT_OFF", percent: 10 },
    { weekdays: [FRIDAY] },
  );
  database
    .prepare("INSERT INTO stock_balances (product_id, quantity) VALUES ('almendras', 12400)")
    .run();
});

afterEach(() => {
  database.close();
});

describe("consulting a product on the register", () => {
  it("answers the product the way the screen shows it, priced for the scale's weight with the promotion in force", async () => {
    expect(await consultProductFor(deps(), { product_id: "almendras" })).toEqual({
      kind: "consulted",
      product_id: "almendras",
      name: "Almendras peladas",
      sale_unit: "KG",
      unit_price: 1_890_000,
      promotion: { benefit: { kind: "PERCENT_OFF", percent: 10 }, weekdays: [FRIDAY] },
      weight_thousandths: 410,
      amount: 697_410,
      stock_thousandths: 12_400,
    });
  });

  it("finds the product by a scanned barcode", async () => {
    const outcome = await consultProductFor(deps(), { barcode: "7790001000017" });

    expect(outcome).toMatchObject({ kind: "consulted", product_id: "almendras" });
  });

  it("answers a product sold by unit priced for one unit, with no weight and an unknown stock", async () => {
    addProduct(database, undefined, { id: "leche", name: "Leche vegetal" });
    addPrice(database, "leche", "2026-09-01T00:00:00.000Z", 430_000);
    addDiscount(
      database,
      "two-for-one",
      { kind: "PRODUCT", id: "leche" },
      { kind: "BUY_N_PAY_M", buyQty: 2, payQty: 1 },
    );

    const outcome = await consultProductFor(deps(), { product_id: "leche" });

    expect(outcome).toMatchObject({
      kind: "consulted",
      promotion: null,
      weight_thousandths: null,
      amount: 430_000,
      stock_thousandths: null,
    });
  });

  it("answers not found for an unknown barcode", async () => {
    expect(await consultProductFor(deps(), { barcode: "0000" })).toEqual({ kind: "not_found" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    const signedOut = {
      ...deps(),
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson: createSignedInPerson(),
        readPepper: async () => undefined,
        hashPin: async () => "",
        now: () => SALE_REQUESTS_NOW,
      }),
    };

    expect(await consultProductFor(signedOut, { product_id: "almendras" })).toEqual({
      kind: "not_signed_in",
    });
  });

  it("answers that no session is open", async () => {
    database.prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = 'x'").run();

    expect(await consultProductFor(deps(), { product_id: "almendras" })).toEqual({
      kind: "no_open_session",
    });
  });

  it("changes nothing in the sale or the stock", async () => {
    const before = database.prepare("SELECT * FROM sale_lines").all();

    await consultProductFor(deps(), { product_id: "almendras" });

    expect(database.prepare("SELECT * FROM sale_lines").all()).toEqual(before);
    expect(database.prepare("SELECT quantity FROM stock_balances").all()).toEqual([
      { quantity: 12_400 },
    ]);
  });
});
