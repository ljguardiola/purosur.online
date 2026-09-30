import type { OpenSale, ScanProductOutcome } from "@purosur/contracts";
import { type SaleWithLines, saleTotal } from "@purosur/domain";
import {
  addScannedProduct,
  type Clock,
  currentSale,
  type IdGenerator,
} from "@purosur/domain/sales/use-cases";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteSaleLedger } from "./sqlite-sale-ledger";

export interface SaleRequestDeps {
  database: LocalDatabase;
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

export function scanProductFor(
  { database, now, ids }: SaleRequestDeps,
  userId: string,
  code: string,
): ScanProductOutcome {
  const outcome = addScannedProduct(
    { ledger: saleLedger(database), clock: { now }, ids },
    { actorId: userId, code },
  );
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

export function currentSaleFor(database: LocalDatabase, userId: string): OpenSale | null {
  const outcome = currentSale({ ledger: saleLedger(database) }, { actorId: userId });
  return outcome.kind === "open" ? toOpenSale(outcome.sale) : null;
}
