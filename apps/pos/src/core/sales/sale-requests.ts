import type {
  AddProductOutcome,
  Authorization,
  AuthorizationRefusal,
  AuthorizedBy,
  CancelLockedSaleOutcome,
  CancelPaidSaleOutcome,
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
  type PlannedRefund,
  type RegisterActor,
  registerOperationAccess,
  type SaleLine,
  type SaleWithLines,
  saleTotal,
} from "@purosur/domain";
import {
  type AddScannedProductOutcome,
  addScannedProduct,
  addSearchedProduct,
  type CancelPaidSaleGrant,
  type Clock,
  cancelPaidSale,
  cancelSale,
  changeLineQuantity,
  chargeSaleByTransfer,
  chargeSaleInCash,
  currentSale,
  type IdGenerator,
  type OperationAuthorization,
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

export function toWireRefund(refund: PlannedRefund): OpenSale["refunds_on_cancel"][number] {
  return {
    payment_id: refund.paymentId,
    method: refund.method,
    amount: refund.amount,
    state: refund.state,
  };
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
  refundsOnCancel: readonly PlannedRefund[];
}

interface SellerAnswer<Outcome> {
  outcome: Outcome;
  cancelAuthorizationRequired: boolean;
}

function cancelAuthorizationRequired(database: LocalDatabase, userId: string): boolean {
  const actor: RegisterActor = {
    id: userId,
    access: new SqliteSignInStore(database).activePerson(userId)?.access,
  };
  return (
    registerOperationAccess({ kind: "cancel_paid_sale" }, actor).kind === "needs_authorization"
  );
}

function asSeller<Outcome>(
  { database, gate }: Pick<SaleRequestDeps, "database" | "gate">,
  work: (actorId: string) => Outcome | Promise<Outcome>,
) {
  return gate.run(
    { kind: "sell" },
    async ({ signedInUserId }): Promise<SellerAnswer<Outcome>> => ({
      outcome: await work(signedInUserId),
      cancelAuthorizationRequired: cancelAuthorizationRequired(database, signedInUserId),
    }),
  );
}

function toOpenSale(
  { sale, chargeRefusal, balance, linesEditable, cancellable, refundsOnCancel }: OpenSaleAnswer,
  cancelAuthorizationRequired: boolean,
): OpenSale {
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
    refunds_on_cancel: refundsOnCancel.map(toWireRefund),
    cancel_authorization_required: cancelAuthorizationRequired,
    charge_refusal: chargeRefusal ?? null,
  };
}

export async function scanProductFor(
  { database, gate, now, ids }: SaleRequestDeps,
  code: string,
): Promise<ScanProductOutcome> {
  const guarded = await asSeller({ database, gate }, (actorId) =>
    addScannedProduct({ ledger: saleLedger(database), clock: { now }, ids }, { actorId, code }),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const { outcome, cancelAuthorizationRequired } = guarded.result;
  switch (outcome.kind) {
    case "added":
    case "no_price":
    case "sold_by_weight":
      return toDetailOutcome(outcome, cancelAuthorizationRequired);
    default:
      return { kind: outcome.kind };
  }
}

export async function addSearchedProductFor(
  { database, gate, now, ids }: SaleRequestDeps,
  productId: string,
): Promise<AddProductOutcome> {
  const guarded = await asSeller({ database, gate }, (actorId) =>
    addSearchedProduct(
      { ledger: saleLedger(database), clock: { now }, ids },
      { actorId, productId },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const { outcome, cancelAuthorizationRequired } = guarded.result;
  switch (outcome.kind) {
    case "added":
    case "no_price":
    case "sold_by_weight":
      return toDetailOutcome(outcome, cancelAuthorizationRequired);
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
  cancelAuthorizationRequired: boolean,
): Extract<ScanProductOutcome, { kind: SaleDetailOutcome["kind"] }> {
  return outcome.kind === "added"
    ? { kind: "added", sale: toOpenSale(outcome, cancelAuthorizationRequired) }
    : { kind: outcome.kind, product_name: outcome.productName };
}

export async function currentSaleFor({
  database,
  gate,
  now,
}: Pick<SaleRequestDeps, "database" | "gate" | "now">): Promise<CurrentSaleAnswer> {
  const guarded = await asSeller({ database, gate }, (actorId) =>
    currentSale({ ledger: saleLedger(database), clock: { now } }, { actorId }),
  );
  if (guarded.kind === "not_signed_in") {
    return null;
  }
  if (guarded.kind !== "performed" || guarded.result.outcome.kind === "not_permitted") {
    return "not_permitted";
  }
  const { outcome, cancelAuthorizationRequired } = guarded.result;
  return outcome.kind === "open" ? toOpenSale(outcome, cancelAuthorizationRequired) : null;
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
  const guarded = await asSeller({ database, gate }, (actorId) =>
    changeLineQuantity(
      { ledger: saleLedger(database), clock: { now } },
      { actorId, lineId, quantity, expectedQuantity },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const { outcome, cancelAuthorizationRequired } = guarded.result;
  return outcome.kind === "changed"
    ? { kind: "changed", sale: toOpenSale(outcome, cancelAuthorizationRequired) }
    : { kind: outcome.kind };
}

export async function removeSaleLineFor(
  { database, gate, now }: Pick<SaleRequestDeps, "database" | "gate" | "now">,
  lineId: string,
): Promise<RemoveSaleLineOutcome> {
  const guarded = await asSeller({ database, gate }, (actorId) =>
    removeSaleLine({ ledger: saleLedger(database), clock: { now } }, { actorId, lineId }),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const { outcome, cancelAuthorizationRequired } = guarded.result;
  return outcome.kind === "removed"
    ? { kind: "removed", sale: toOpenSale(outcome, cancelAuthorizationRequired) }
    : { kind: outcome.kind };
}

export async function cancelSaleFor({
  database,
  gate,
}: Pick<SaleRequestDeps, "database" | "gate">): Promise<CancelSaleOutcome> {
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    cancelSale({ ledger: saleLedger(database) }, { actorId: signedInUserId }),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  return { kind: guarded.result.kind };
}

export interface CancelPaidSaleRequest {
  saleId: string;
  authorization?: Authorization | undefined;
}

interface CancelPaidSaleRequestGrant extends CancelPaidSaleGrant {
  authorizer: AuthorizedBy | null;
}

type CancelPaidSaleRefusal = Extract<
  CancelPaidSaleOutcome,
  { kind: "not_signed_in" | "lacks_permission" | AuthorizationRefusal["kind"] }
>;

export async function cancelPaidSaleFor(
  { database, gate, now, ids, readOutboxChainKey }: OutboxSaleRequestDeps,
  { saleId, authorization }: CancelPaidSaleRequest,
): Promise<CancelPaidSaleOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  const outcome = await cancelPaidSale<CancelPaidSaleRequestGrant, CancelPaidSaleRefusal>(
    {
      ledger: saleLedger(database, outboxChainKey),
      clock: { now },
      ids,
      authority: {
        async authorize(): Promise<
          OperationAuthorization<CancelPaidSaleRequestGrant, CancelPaidSaleRefusal>
        > {
          if (outboxChainKey === undefined) {
            return { kind: "refused", refusal: { kind: "unavailable" } };
          }
          const guarded = await gate.runAuthorized(
            { kind: "cancel_paid_sale" },
            authorization,
            async (actor) => actor,
          );
          return guarded.kind === "performed"
            ? {
                kind: "granted",
                grant: {
                  actorId: guarded.result.signedInUserId,
                  authorizedBy: guarded.authorized_by?.user_id,
                  authorizer: guarded.authorized_by,
                },
              }
            : { kind: "refused", refusal: guarded };
        },
      },
    },
    { saleId, from: "sale" },
  );
  return outcome.kind === "cancelled"
    ? {
        kind: "cancelled",
        refunds: outcome.refunds.map(toWireRefund),
        authorized_by: outcome.grant.authorizer,
      }
    : outcome;
}

export interface CancelLockedSaleRequest {
  saleId: string;
  closer: Authorization;
}

type CancelLockedSaleRefusal = Extract<
  CancelLockedSaleOutcome,
  { kind: "unavailable" | AuthorizationRefusal["kind"] | "not_locked" }
>;

export async function cancelLockedSaleFor(
  { database, gate, now, ids, readOutboxChainKey }: OutboxSaleRequestDeps,
  { saleId, closer }: CancelLockedSaleRequest,
): Promise<CancelLockedSaleOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  const outcome = await cancelPaidSale<CancelPaidSaleGrant, CancelLockedSaleRefusal>(
    {
      ledger: saleLedger(database, outboxChainKey),
      clock: { now },
      ids,
      authority: {
        async authorize(): Promise<
          OperationAuthorization<CancelPaidSaleGrant, CancelLockedSaleRefusal>
        > {
          const guarded = await gate.runWhileLocked(
            { kind: "close_locked_register", session: readOpenSession(database) },
            closer,
            async (person) => person,
          );
          return guarded.kind === "performed"
            ? {
                kind: "granted",
                grant: {
                  actorId: guarded.result.user_id,
                  authorizedBy: guarded.result.user_id,
                },
              }
            : { kind: "refused", refusal: guarded };
        },
      },
    },
    { saleId, from: "locked_register" },
  );
  return outcome.kind === "cancelled"
    ? { kind: "cancelled", refunds: outcome.refunds.map(toWireRefund) }
    : outcome;
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
