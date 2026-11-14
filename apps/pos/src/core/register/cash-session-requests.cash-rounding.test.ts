import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { chargeSaleInCashFor, scanProductFor } from "../sales/sale-requests";
import {
  countingIds,
  openSellingRegister,
  saleRequestDeps,
} from "../sales/test-support/sale-requests";
import { cashCountPreviewFor, closeCashSessionFor } from "./cash-session-requests";

let database: LocalDatabase;
let ids: ReturnType<typeof countingIds>;

function deps() {
  return saleRequestDeps(database, ids);
}

async function sellInCash(unitPrice: number, tendered: number): Promise<void> {
  database.exec(`UPDATE prices SET unit_price = ${unitPrice}`);
  const outcome = await scanProductFor(deps(), "111");
  if (outcome.kind !== "added") {
    throw new Error("test setup: the product was not added");
  }
  await chargeSaleInCashFor(deps(), { saleId: outcome.sale.id, tendered });
}

async function sellRoundedInCash(): Promise<void> {
  await sellInCash(327_000, 500_000);
  await sellInCash(527_000, 520_000);
}

beforeEach(() => {
  ids = countingIds();
  database = openSellingRegister();
});

afterEach(() => {
  database.close();
});

describe("counting the cash of a session with sales rounded down", () => {
  it("previews no difference when exactly the cash received is counted", async () => {
    await sellRoundedInCash();

    expect(cashCountPreviewFor(database, 840_000)).toEqual({ difference: 0 });
  });

  it("closes with the cash received as the expected cash and no difference", async () => {
    await sellRoundedInCash();

    expect(
      await closeCashSessionFor(deps(), { sessionId: "session-1", countedCash: 840_000 }),
    ).toMatchObject({
      kind: "closed",
      session: { id: "session-1", expected_cash: 840_000, counted_cash: 840_000, difference: 0 },
    });
  });
});
