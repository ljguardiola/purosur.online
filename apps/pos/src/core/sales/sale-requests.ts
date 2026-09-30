import type {
  AddProductOutcome,
  CurrentSaleAnswer,
  OpenSale,
  ScanProductOutcome,
  SearchProductsOutcome,
} from "@purosur/contracts";
import { type SaleWithLines, saleTotal } from "@purosur/domain";
import {
  type AddScannedProductOutcome,
  addScannedProduct,
  addSearchedProduct,
  type Clock,
  currentSale,
  type IdGenerator,
  searchProductsByName,
} from "@purosur/domain/sales/use-cases";
import type { ActionGate } from "../access/action-gate";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteSaleLedger } from "./sqlite-sale-ledger";

export interface SaleRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  now: Clock["now"];
  ids: IdGenerator;
}

function saleLedger(database: LocalDatabase): SqliteSaleLedger {
  return new SqliteSaleLedger(database, new SqliteSignInStore(database));
}

function toOpenSale(sale: SaleWithLines): OpenSale {
  return {
    id: sale.id,
    lines: sale.lines.map((line) => ({
      id: line.id,
      product_id: line.productId,
      product_name: line.productName,
      quantity: line.quantity,
      list_unit_price: line.listUnitPrice,
      line_total: line.lineTotal,
    })),
    total: saleTotal(sale.lines),
  };
}

export async function scanProductFor(
  { database, gate, now, ids }: SaleRequestDeps,
  code: string,
): Promise<ScanProductOutcome> {
  const guarded = await gate.run({ permission: "sell_and_charge" }, async ({ signedInUserId }) =>
    addScannedProduct(
      { ledger: saleLedger(database), clock: { now }, ids },
      { actorId: signedInUserId, code },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  switch (outcome.kind) {
    case "added":
    case "no_price":
    case "sold_by_weight":
      return toDetailOutcome(outcome);
    default:
      return { kind: outcome.kind };
  }
}

export async function addSearchedProductFor(
  { database, gate, now, ids }: SaleRequestDeps,
  productId: string,
): Promise<AddProductOutcome> {
  const guarded = await gate.run({ permission: "sell_and_charge" }, async ({ signedInUserId }) =>
    addSearchedProduct(
      { ledger: saleLedger(database), clock: { now }, ids },
      { actorId: signedInUserId, productId },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  switch (outcome.kind) {
    case "added":
    case "no_price":
    case "sold_by_weight":
      return toDetailOutcome(outcome);
    default:
      return { kind: outcome.kind };
  }
}

export async function searchProductsFor(
  { database, gate, now }: Pick<SaleRequestDeps, "database" | "gate" | "now">,
  query: string,
): Promise<SearchProductsOutcome> {
  const guarded = await gate.run({ permission: "sell_and_charge" }, async ({ signedInUserId }) =>
    searchProductsByName(
      { ledger: saleLedger(database), clock: { now } },
      { actorId: signedInUserId, query },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  if (outcome.kind !== "results") {
    return { kind: outcome.kind };
  }
  return {
    kind: "results",
    products: outcome.products.map((found) => ({
      product_id: found.productId,
      name: found.name,
      sale_unit: found.saleUnit,
      unit_price: found.unitPrice,
      matches: found.matches,
    })),
    more: outcome.more,
  };
}

type SaleDetailOutcome = Extract<
  AddScannedProductOutcome,
  { kind: "added" | "no_price" | "sold_by_weight" }
>;

function toDetailOutcome(
  outcome: SaleDetailOutcome,
): Extract<ScanProductOutcome, { kind: SaleDetailOutcome["kind"] }> {
  return outcome.kind === "added"
    ? { kind: "added", sale: toOpenSale(outcome.sale) }
    : { kind: outcome.kind, product_name: outcome.productName };
}

export async function currentSaleFor({
  database,
  gate,
}: Pick<SaleRequestDeps, "database" | "gate">): Promise<CurrentSaleAnswer> {
  const guarded = await gate.run({ permission: "sell_and_charge" }, async ({ signedInUserId }) =>
    currentSale({ ledger: saleLedger(database) }, { actorId: signedInUserId }),
  );
  if (guarded.kind === "not_signed_in") {
    return null;
  }
  if (guarded.kind !== "performed" || guarded.result.kind === "not_permitted") {
    return "not_permitted";
  }
  return guarded.result.kind === "open" ? toOpenSale(guarded.result.sale) : null;
}
