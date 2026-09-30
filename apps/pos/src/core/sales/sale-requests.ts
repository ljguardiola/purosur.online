import type {
  CancelSaleOutcome,
  ChangeLineQuantityOutcome,
  CurrentSaleAnswer,
  OpenSale,
  RemoveSaleLineOutcome,
  ScanProductOutcome,
} from "@purosur/contracts";
import { type SaleLine, type SaleWithLines, saleTotal } from "@purosur/domain";
import {
  addScannedProduct,
  type Clock,
  cancelSale,
  changeLineQuantity,
  currentSale,
  type IdGenerator,
  removeSaleLine,
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

export interface CancelSaleRequestDeps extends SaleRequestDeps {
  readOutboxChainKey: () => Promise<string | undefined>;
}

function saleLedger(database: LocalDatabase, outboxChainKey?: string): SqliteSaleLedger {
  return new SqliteSaleLedger(database, new SqliteSignInStore(database), outboxChainKey);
}

function appliedPromotion(line: SaleLine): OpenSale["lines"][number]["promotion"] {
  const benefit = line.promotions.find(({ id }) => id === line.promotionId)?.benefit;
  if (benefit === undefined) {
    return null;
  }
  return benefit.kind === "PERCENT_OFF"
    ? { kind: benefit.kind, percent: benefit.percent }
    : { kind: benefit.kind, buy_qty: benefit.buyQty, pay_qty: benefit.payQty };
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
      discount_amount: line.discountAmount,
      promotion: appliedPromotion(line),
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

export async function changeLineQuantityFor(
  { database, gate, now, ids }: SaleRequestDeps,
  lineId: string,
  quantity: number,
): Promise<ChangeLineQuantityOutcome> {
  const guarded = await gate.run({ permission: "sell_and_charge" }, async ({ signedInUserId }) =>
    changeLineQuantity(
      { ledger: saleLedger(database), clock: { now }, ids },
      { actorId: signedInUserId, lineId, quantity },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  return outcome.kind === "changed"
    ? { kind: "changed", sale: toOpenSale(outcome.sale) }
    : { kind: outcome.kind };
}

export async function removeSaleLineFor(
  { database, gate, now, ids }: SaleRequestDeps,
  lineId: string,
): Promise<RemoveSaleLineOutcome> {
  const guarded = await gate.run({ permission: "sell_and_charge" }, async ({ signedInUserId }) =>
    removeSaleLine(
      { ledger: saleLedger(database), clock: { now }, ids },
      { actorId: signedInUserId, lineId },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  return outcome.kind === "removed"
    ? { kind: "removed", sale: toOpenSale(outcome.sale) }
    : { kind: outcome.kind };
}

export async function cancelSaleFor({
  database,
  gate,
  now,
  ids,
  readOutboxChainKey,
}: CancelSaleRequestDeps): Promise<CancelSaleOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const guarded = await gate.run({ permission: "sell_and_charge" }, async ({ signedInUserId }) =>
    cancelSale(
      { ledger: saleLedger(database, outboxChainKey), clock: { now }, ids },
      { actorId: signedInUserId },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  return { kind: guarded.result.kind };
}
