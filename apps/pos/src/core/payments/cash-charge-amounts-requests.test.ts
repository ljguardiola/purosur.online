import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { chargeSaleByTransferFor, scanProductFor } from "../sales/sale-requests";
import {
  countingIds,
  openSellingRegister,
  saleRequestDeps,
} from "../sales/test-support/sale-requests";
import { cashChargeAmountsFor } from "./cash-charge-amounts-requests";

let database: LocalDatabase;
let ids: ReturnType<typeof countingIds>;

function deps() {
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

beforeEach(() => {
  ids = countingIds();
  database = openSellingRegister();
});

afterEach(() => {
  database.close();
});

describe("the amounts of a cash charge", () => {
  it("are the rounded amount to charge, its quick amounts and the shortage-of-change option", async () => {
    const saleId = await sellFor(2_519_250);

    expect(await cashChargeAmountsFor(deps(), { saleId })).toEqual({
      amount_to_charge: 2_510_000,
      cash_rounding: 9250,
      quick_amounts: [2_510_000, 2_600_000, 3_000_000, 4_000_000],
      change_discount_option: 10_000,
    });
  });

  it("are taken from what is still pending after another payment", async () => {
    const saleId = await sellFor(2_519_250);
    await chargeSaleByTransferFor(deps(), { saleId, amount: 1_000_000 });

    expect(await cashChargeAmountsFor(deps(), { saleId })).toEqual({
      amount_to_charge: 1_510_000,
      cash_rounding: 9250,
      quick_amounts: [1_510_000, 1_600_000, 2_000_000],
      change_discount_option: 10_000,
    });
  });

  it("are taken from the total with the discount for shortage of change", async () => {
    const saleId = await sellFor(2_519_250);

    expect(await cashChargeAmountsFor(deps(), { saleId, saleDiscount: 10_000 })).toEqual({
      amount_to_charge: 2_500_000,
      cash_rounding: 9250,
      quick_amounts: [2_500_000, 3_000_000, 4_000_000],
      change_discount_option: null,
    });
  });

  it("are none for a discount larger than the sale", async () => {
    const saleId = await sellFor(2_519_250);

    expect(await cashChargeAmountsFor(deps(), { saleId, saleDiscount: 2_519_251 })).toBeNull();
  });

  it("are none for a sale that is not the one open", async () => {
    await sellFor(2_519_250);

    expect(await cashChargeAmountsFor(deps(), { saleId: "another-sale" })).toBeNull();
  });

  it("are none while there is no open sale", async () => {
    expect(await cashChargeAmountsFor(deps(), { saleId: "s1" })).toBeNull();
  });
});
