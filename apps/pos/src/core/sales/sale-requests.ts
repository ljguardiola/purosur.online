import type { CurrentSaleAnswer, OpenSale, ScanProductOutcome } from "@purosur/contracts";
import { type SaleWithLines, saleTotal } from "@purosur/domain";
import {
  addScannedProduct,
  type Clock,
  currentSale,
  type IdGenerator,
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
      return { kind: "added", sale: toOpenSale(outcome.sale) };
    case "no_price":
    case "sold_by_weight":
      return { kind: outcome.kind, product_name: outcome.productName };
    default:
      return { kind: outcome.kind };
  }
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
