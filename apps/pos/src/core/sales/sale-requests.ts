import type {
  AddProductOutcome,
  Authorization,
  CancelLockedSaleOutcome,
  CancelSaleOutcome,
  CashChargeAnswer,
  ChangeLineQuantityOutcome,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  CurrentSaleAnswer,
  OpenSale,
  RemoveSaleLineOutcome,
  ScanProductOutcome,
  SearchProductsOutcome,
} from "@purosur/contracts";
import {
  type ChargeRefusal,
  cashCharge,
  type SaleLine,
  type SaleWithLines,
  saleTotal,
} from "@purosur/domain";
import {
  type AddScannedProductOutcome,
  addScannedProduct,
  addSearchedProduct,
  type Clock,
  cancelSale,
  changeLineQuantity,
  chargeSaleByTransfer,
  chargeSaleInCash,
  currentSale,
  type IdGenerator,
  removeSaleLine,
  searchProductsByName,
} from "@purosur/domain/sales/use-cases";
import type { ActionGate } from "../access/action-gate";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
import { readOpenSession } from "../register/sqlite-cash-ledger";
import { SqliteSaleLedger } from "./sqlite-sale-ledger";

export interface SaleRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  now: Clock["now"];
  ids: IdGenerator;
}

export interface OutboxSaleRequestDeps extends SaleRequestDeps {
  readOutboxChainKey: () => Promise<string | undefined>;
}

export interface ChargeSaleInCashRequest {
  saleId: string;
  tendered: number;
}

export interface ChargeSaleByTransferRequest {
  saleId: string;
  amount: number;
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

interface OpenSaleAnswer {
  sale: SaleWithLines;
  chargeRefusal: ChargeRefusal | undefined;
  balance: { paid: number; pending: number };
  linesEditable: boolean;
  cancellable: boolean;
}

function toOpenSale({
  sale,
  chargeRefusal,
  balance,
  linesEditable,
  cancellable,
}: OpenSaleAnswer): OpenSale {
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
    paid: balance.paid,
    pending: balance.pending,
    lines_editable: linesEditable,
    cancellable,
    charge_refusal: chargeRefusal ?? null,
  };
}

export async function scanProductFor(
  { database, gate, now, ids }: SaleRequestDeps,
  code: string,
): Promise<ScanProductOutcome> {
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
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
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
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
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
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
    ? { kind: "added", sale: toOpenSale(outcome) }
    : { kind: outcome.kind, product_name: outcome.productName };
}

export async function currentSaleFor({
  database,
  gate,
  now,
}: Pick<SaleRequestDeps, "database" | "gate" | "now">): Promise<CurrentSaleAnswer> {
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    currentSale({ ledger: saleLedger(database), clock: { now } }, { actorId: signedInUserId }),
  );
  if (guarded.kind === "not_signed_in") {
    return null;
  }
  if (guarded.kind !== "performed" || guarded.result.kind === "not_permitted") {
    return "not_permitted";
  }
  const outcome = guarded.result;
  return outcome.kind === "open" ? toOpenSale(outcome) : null;
}

export async function cashChargeFor(
  deps: Pick<SaleRequestDeps, "database" | "gate" | "now">,
  { saleId, tendered }: ChargeSaleInCashRequest,
): Promise<CashChargeAnswer> {
  const sale = await currentSaleFor(deps);
  if (sale === "not_permitted") {
    return sale;
  }
  return sale === null || sale.id !== saleId ? null : cashCharge(sale.pending, tendered);
}

export async function changeLineQuantityFor(
  { database, gate, now }: Pick<SaleRequestDeps, "database" | "gate" | "now">,
  lineId: string,
  quantity: number,
  expectedQuantity: number,
): Promise<ChangeLineQuantityOutcome> {
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    changeLineQuantity(
      { ledger: saleLedger(database), clock: { now } },
      { actorId: signedInUserId, lineId, quantity, expectedQuantity },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  return outcome.kind === "changed"
    ? { kind: "changed", sale: toOpenSale(outcome) }
    : { kind: outcome.kind };
}

export async function removeSaleLineFor(
  { database, gate, now }: Pick<SaleRequestDeps, "database" | "gate" | "now">,
  lineId: string,
): Promise<RemoveSaleLineOutcome> {
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    removeSaleLine(
      { ledger: saleLedger(database), clock: { now } },
      { actorId: signedInUserId, lineId },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  return outcome.kind === "removed"
    ? { kind: "removed", sale: toOpenSale(outcome) }
    : { kind: outcome.kind };
}

export async function cancelSaleFor({
  database,
  gate,
}: Pick<SaleRequestDeps, "database" | "gate">): Promise<CancelSaleOutcome> {
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    cancelSale({ ledger: saleLedger(database) }, { actorId: signedInUserId, from: "sale" }),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  return { kind: guarded.result.kind };
}

export async function cancelLockedSaleFor(
  { database, gate }: Pick<SaleRequestDeps, "database" | "gate">,
  closer: Authorization,
): Promise<CancelLockedSaleOutcome> {
  const guarded = await gate.runWhileLocked(
    { kind: "close_locked_register", session: readOpenSession(database) },
    closer,
    async (person) =>
      cancelSale(
        { ledger: saleLedger(database) },
        { actorId: person.user_id, from: "locked_register" },
      ),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  return { kind: guarded.result.kind };
}

export async function chargeSaleInCashFor(
  { database, gate, now, ids, readOutboxChainKey }: OutboxSaleRequestDeps,
  { saleId, tendered }: ChargeSaleInCashRequest,
): Promise<ChargeSaleInCashOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    chargeSaleInCash(
      { ledger: saleLedger(database, outboxChainKey), clock: { now }, ids },
      { actorId: signedInUserId, saleId, tendered },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  switch (outcome.kind) {
    case "completed":
      return {
        kind: "completed",
        sale_id: outcome.saleId,
        total: outcome.total,
        tendered: outcome.tendered,
        change: outcome.change,
      };
    case "partially_paid":
      return partiallyPaid(outcome);
    case "reaches_buyer_identification_threshold":
      return { kind: outcome.kind, threshold: outcome.threshold };
    default:
      return { kind: outcome.kind };
  }
}

function partiallyPaid(outcome: {
  saleId: string;
  total: number;
  paid: number;
  pending: number;
}): Extract<ChargeSaleInCashOutcome, { kind: "partially_paid" }> {
  return {
    kind: "partially_paid",
    sale_id: outcome.saleId,
    total: outcome.total,
    paid: outcome.paid,
    pending: outcome.pending,
  };
}

export async function chargeSaleByTransferFor(
  { database, gate, now, ids, readOutboxChainKey }: OutboxSaleRequestDeps,
  { saleId, amount }: ChargeSaleByTransferRequest,
): Promise<ChargeSaleByTransferOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    chargeSaleByTransfer(
      { ledger: saleLedger(database, outboxChainKey), clock: { now }, ids },
      { actorId: signedInUserId, saleId, amount },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  switch (outcome.kind) {
    case "completed":
      return { kind: "completed", sale_id: outcome.saleId, total: outcome.total };
    case "partially_paid":
      return partiallyPaid(outcome);
    case "exceeds_pending":
      return { kind: outcome.kind, pending: outcome.pending };
    case "reaches_buyer_identification_threshold":
      return { kind: outcome.kind, threshold: outcome.threshold };
    default:
      return { kind: outcome.kind };
  }
}
