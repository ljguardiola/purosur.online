import type {
  AddProductOutcome,
  AddWeighedProductOutcome,
  AdjustSaleLineOutcome,
  ApplySaleDiscountOutcome,
  Authorization,
  AuthorizationRefusal,
  AuthorizedBy,
  CancelLockedSaleOutcome,
  CancelPaidSaleOutcome,
  CancelSaleOutcome,
  CashChargeAnswer,
  ChangeLineQuantityOutcome,
  ChangeLineWeightOutcome,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  ChargeSaleOnStandaloneTerminalOutcome,
  CurrentSaleAnswer,
  ManualAdjustmentRequest,
  OpenSale,
  PreviewSaleDiscountOutcome,
  PreviewSaleLineAdjustmentOutcome,
  RemoveSaleLineOutcome,
  SaleDiscountRequest,
  ScanProductOutcome,
  SearchProductsOutcome,
  WeighProductOutcome,
} from "@purosur/contracts";
import {
  amountToCharge,
  appliedSaleDiscountAmount,
  type ChargeRefusal,
  cashCharge,
  type ManualAdjustmentValue,
  type MercadoPagoChargeInProgress,
  type PaidOrderDiscoveryState,
  type PlannedRefund,
  type RegisterActor,
  type RegisterOperation,
  registerOperationAccess,
  type SaleDiscountValue,
  type SaleLine,
  type SaleWithLines,
  saleDiscountUnavailability,
  saleTotal,
} from "@purosur/domain";
import {
  type AddScannedProductOutcome,
  type AdjustSaleLineGrant,
  type ApplySaleDiscountGrant,
  addScannedProduct,
  addSearchedProduct,
  addWeighedProduct,
  adjustSaleLine,
  applySaleDiscount,
  type CancelPaidSaleGrant,
  type Clock,
  cancelPaidSale,
  cancelSale,
  changeLineQuantity,
  changeLineWeight,
  chargeSaleByTransfer,
  chargeSaleInCash,
  chargeSaleOnStandaloneTerminal,
  currentSale,
  type IdGenerator,
  type OperationAuthorization,
  previewSaleDiscount,
  previewSaleLineAdjustment,
  removeSaleLine,
  type Scale,
  searchProductsByName,
  weighProductOnScale,
} from "@purosur/domain/sales/use-cases";
import { toWireRefund } from "../payments/wire-refund";
import type { LocalDatabase } from "../platform/local-database";
import { readOpenSession } from "../register/sqlite-cash-ledger";
import type { ActionGate } from "../sessions/action-gate";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { SqliteSaleLedger } from "./sqlite-sale-ledger";

export interface SaleRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  now: Clock["now"];
  ids: IdGenerator;
}

export interface SellingRequestDeps extends SaleRequestDeps {
  paidOrderDiscovery: () => PaidOrderDiscoveryState;
  newSalesStoppedByDisk: () => boolean;
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

export interface ChargeSaleOnStandaloneTerminalRequest {
  saleId: string;
  amount: number;
}

function saleLedger(database: LocalDatabase, outboxChainKey?: string): SqliteSaleLedger {
  return new SqliteSaleLedger(database, new SqliteSignInStore(database), outboxChainKey);
}

function sellingLedger(
  database: LocalDatabase,
  paidOrderDiscovery: () => PaidOrderDiscoveryState,
  newSalesStoppedByDisk: () => boolean,
): SqliteSaleLedger {
  return new SqliteSaleLedger(
    database,
    new SqliteSignInStore(database),
    undefined,
    paidOrderDiscovery,
    newSalesStoppedByDisk,
  );
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

function toManualAdjustmentRequest(
  adjustment: ManualAdjustmentValue | null,
): OpenSale["lines"][number]["manual_adjustment"] {
  if (adjustment === null) {
    return null;
  }
  switch (adjustment.kind) {
    case "PRICE":
      return { kind: "PRICE", value: adjustment.unitPrice };
    case "PERCENT":
      return { kind: "PERCENT", value: adjustment.percent };
    case "AMOUNT":
      return { kind: "AMOUNT", value: adjustment.amount };
  }
}

function toWireSaleDiscount(sale: SaleWithLines): OpenSale["sale_discount"] {
  const { saleDiscount } = sale;
  if (saleDiscount === null) {
    return null;
  }
  const amount = appliedSaleDiscountAmount(sale);
  return saleDiscount.kind === "PERCENT"
    ? { kind: "PERCENT", value: saleDiscount.percent, amount }
    : { kind: "AMOUNT", value: saleDiscount.amount, amount };
}

interface OpenSaleAnswer {
  sale: SaleWithLines;
  chargeRefusal: ChargeRefusal | undefined;
  balance: { paid: number; pending: number };
  linesLock: OpenSale["lines_lock"];
  cancelRefusal: OpenSale["cancel_refusal"];
  refundsOnCancel: readonly PlannedRefund[];
  mercadoPagoChargeInProgress: MercadoPagoChargeInProgress | null;
}

interface SaleView {
  cancelAuthorizationRequired: boolean;
  adjustAuthorizationRequired: boolean;
  saleDiscountAuthorizationRequired: boolean;
}

interface SellerAnswer<Outcome> {
  outcome: Outcome;
  view: SaleView;
}

function saleView(database: LocalDatabase, userId: string): SaleView {
  const actor: RegisterActor = {
    id: userId,
    access: new SqliteSignInStore(database).activePerson(userId)?.access,
  };
  const needsAuthorization = (operation: RegisterOperation) =>
    registerOperationAccess(operation, actor).kind === "needs_authorization";
  return {
    cancelAuthorizationRequired: needsAuthorization({ kind: "cancel_paid_sale" }),
    adjustAuthorizationRequired: needsAuthorization({ kind: "adjust_sale_line" }),
    saleDiscountAuthorizationRequired: needsAuthorization({ kind: "apply_sale_discount" }),
  };
}

function asSeller<Outcome>(
  { database, gate }: Pick<SaleRequestDeps, "database" | "gate">,
  work: (actorId: string) => Outcome | Promise<Outcome>,
) {
  return gate.run(
    { kind: "sell" },
    async ({ signedInUserId }): Promise<SellerAnswer<Outcome>> => ({
      outcome: await work(signedInUserId),
      view: saleView(database, signedInUserId),
    }),
  );
}

function toOpenSale(
  {
    sale,
    chargeRefusal,
    balance,
    linesLock,
    cancelRefusal,
    refundsOnCancel,
    mercadoPagoChargeInProgress,
  }: OpenSaleAnswer,
  view: SaleView,
): OpenSale {
  return {
    id: sale.id,
    lines: sale.lines.map((line) => ({
      id: line.id,
      product_id: line.productId,
      product_name: line.productName,
      sale_unit: line.saleUnit,
      weight_source: line.weightSource,
      quantity: line.quantity,
      list_unit_price: line.listUnitPrice,
      discount_amount: line.discountAmount,
      promotion: appliedPromotion(line),
      manual_adjustment: toManualAdjustmentRequest(line.manualAdjustment),
      line_total: line.lineTotal,
    })),
    subtotal: saleTotal(sale.lines),
    sale_discount: toWireSaleDiscount(sale),
    total: amountToCharge(sale),
    paid: balance.paid,
    pending: balance.pending,
    lines_lock: linesLock,
    cancel_refusal: cancelRefusal,
    refunds_on_cancel: refundsOnCancel.map(toWireRefund),
    cancel_authorization_required: view.cancelAuthorizationRequired,
    adjust_authorization_required: view.adjustAuthorizationRequired,
    sale_discount_authorization_required: view.saleDiscountAuthorizationRequired,
    sale_discount_refusal: saleDiscountUnavailability(sale.lines)?.kind ?? null,
    charge_refusal: chargeRefusal ?? null,
    mercado_pago_charge_in_progress:
      mercadoPagoChargeInProgress === null
        ? null
        : {
            payment_transaction_id: mercadoPagoChargeInProgress.paymentTransactionId,
            method: mercadoPagoChargeInProgress.method,
            amount: mercadoPagoChargeInProgress.amount,
            remaining_seconds: mercadoPagoChargeInProgress.remainingSeconds,
            wait_seconds: mercadoPagoChargeInProgress.waitSeconds,
          },
  };
}

export async function scanProductFor(
  { database, gate, now, ids, paidOrderDiscovery, newSalesStoppedByDisk }: SellingRequestDeps,
  code: string,
): Promise<ScanProductOutcome> {
  const guarded = await asSeller({ database, gate }, (actorId) =>
    addScannedProduct(
      {
        ledger: sellingLedger(database, paidOrderDiscovery, newSalesStoppedByDisk),
        clock: { now },
        ids,
      },
      { actorId, code },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const { outcome, view } = guarded.result;
  switch (outcome.kind) {
    case "added":
    case "no_price":
    case "weight_needed":
    case "line_quantity_limit":
      return toDetailOutcome(outcome, view);
    default:
      return { kind: outcome.kind };
  }
}

export async function addSearchedProductFor(
  { database, gate, now, ids, paidOrderDiscovery, newSalesStoppedByDisk }: SellingRequestDeps,
  productId: string,
): Promise<AddProductOutcome> {
  const guarded = await asSeller({ database, gate }, (actorId) =>
    addSearchedProduct(
      {
        ledger: sellingLedger(database, paidOrderDiscovery, newSalesStoppedByDisk),
        clock: { now },
        ids,
      },
      { actorId, productId },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const { outcome, view } = guarded.result;
  switch (outcome.kind) {
    case "added":
    case "no_price":
    case "weight_needed":
    case "line_quantity_limit":
      return toDetailOutcome(outcome, view);
    default:
      return { kind: outcome.kind };
  }
}

export async function searchProductsFor(
  { database, gate }: Pick<SaleRequestDeps, "database" | "gate">,
  query: string,
): Promise<SearchProductsOutcome> {
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    searchProductsByName({ ledger: saleLedger(database) }, { actorId: signedInUserId, query }),
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
  { kind: "added" | "no_price" | "weight_needed" | "line_quantity_limit" }
>;

function toDetailOutcome(
  outcome: SaleDetailOutcome,
  view: SaleView,
): Extract<ScanProductOutcome, { kind: SaleDetailOutcome["kind"] }> {
  switch (outcome.kind) {
    case "added":
      return {
        kind: "added",
        sale: toOpenSale(outcome, view),
        removed_manual_discount: outcome.removedManualDiscount,
        removed_sale_discount: outcome.removedSaleDiscount,
      };
    case "weight_needed":
      return {
        kind: "weight_needed",
        product_id: outcome.productId,
        product_name: outcome.productName,
      };
    default:
      return { kind: outcome.kind, product_name: outcome.productName };
  }
}

export async function addWeighedProductFor(
  { database, gate, now, ids, paidOrderDiscovery, newSalesStoppedByDisk }: SellingRequestDeps,
  productId: string,
  weightThousandths: number,
): Promise<AddWeighedProductOutcome> {
  const guarded = await asSeller({ database, gate }, (actorId) =>
    addWeighedProduct(
      {
        ledger: sellingLedger(database, paidOrderDiscovery, newSalesStoppedByDisk),
        clock: { now },
        ids,
      },
      { actorId, productId, weightThousandths },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const { outcome, view } = guarded.result;
  switch (outcome.kind) {
    case "added":
      return {
        kind: "added",
        sale: toOpenSale(outcome, view),
        removed_manual_discount: outcome.removedManualDiscount,
        removed_sale_discount: outcome.removedSaleDiscount,
      };
    case "no_price":
      return { kind: "no_price", product_name: outcome.productName };
    default:
      return { kind: outcome.kind };
  }
}

export async function weighProductFor(
  {
    database,
    gate,
    now,
    ids,
    paidOrderDiscovery,
    newSalesStoppedByDisk,
    scale,
  }: SellingRequestDeps & { scale: Scale },
  productId: string,
): Promise<WeighProductOutcome> {
  const guarded = await asSeller({ database, gate }, (actorId) =>
    weighProductOnScale(
      {
        ledger: sellingLedger(database, paidOrderDiscovery, newSalesStoppedByDisk),
        clock: { now },
        ids,
        scale,
      },
      { actorId, productId },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const { outcome, view } = guarded.result;
  switch (outcome.kind) {
    case "added":
      return {
        kind: "added",
        sale: toOpenSale(outcome, view),
        removed_manual_discount: outcome.removedManualDiscount,
        removed_sale_discount: outcome.removedSaleDiscount,
      };
    case "no_price":
      return { kind: "no_price", product_name: outcome.productName };
    default:
      return { kind: outcome.kind };
  }
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
  const { outcome, view } = guarded.result;
  return outcome.kind === "open" ? toOpenSale(outcome, view) : null;
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
  const { outcome, view } = guarded.result;
  return outcome.kind === "changed"
    ? {
        kind: "changed",
        sale: toOpenSale(outcome, view),
        removed_manual_discount: outcome.removedManualDiscount,
        removed_sale_discount: outcome.removedSaleDiscount,
      }
    : { kind: outcome.kind };
}

export async function changeLineWeightFor(
  { database, gate, now }: Pick<SaleRequestDeps, "database" | "gate" | "now">,
  lineId: string,
  weightThousandths: number,
  expectedWeightThousandths: number,
): Promise<ChangeLineWeightOutcome> {
  const guarded = await asSeller({ database, gate }, (actorId) =>
    changeLineWeight(
      { ledger: saleLedger(database), clock: { now } },
      { actorId, lineId, weightThousandths, expectedWeightThousandths },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const { outcome, view } = guarded.result;
  return outcome.kind === "changed"
    ? {
        kind: "changed",
        sale: toOpenSale(outcome, view),
        removed_manual_discount: outcome.removedManualDiscount,
        removed_sale_discount: outcome.removedSaleDiscount,
      }
    : { kind: outcome.kind };
}

export interface AdjustSaleLineRequest {
  lineId: string;
  adjustment: ManualAdjustmentRequest;
  reason: string;
  authorization?: Authorization | undefined;
}

type AdjustSaleLineRefusal = Extract<
  AdjustSaleLineOutcome,
  { kind: "not_signed_in" | "lacks_permission" | AuthorizationRefusal["kind"] }
>;

function toManualAdjustmentValue(adjustment: ManualAdjustmentRequest): ManualAdjustmentValue {
  switch (adjustment.kind) {
    case "PRICE":
      return { kind: "PRICE", unitPrice: adjustment.value };
    case "PERCENT":
      return { kind: "PERCENT", percent: adjustment.value };
    case "AMOUNT":
      return { kind: "AMOUNT", amount: adjustment.value };
  }
}

export async function adjustSaleLineFor(
  { database, gate, now }: Pick<SaleRequestDeps, "database" | "gate" | "now">,
  { lineId, adjustment, reason, authorization }: AdjustSaleLineRequest,
): Promise<AdjustSaleLineOutcome> {
  const outcome = await adjustSaleLine<AdjustSaleLineGrant, AdjustSaleLineRefusal>(
    {
      ledger: saleLedger(database),
      clock: { now },
      authority: {
        async authorize(): Promise<
          OperationAuthorization<AdjustSaleLineGrant, AdjustSaleLineRefusal>
        > {
          const guarded = await gate.runAuthorized(
            { kind: "adjust_sale_line" },
            authorization,
            async (actor) => actor,
          );
          return guarded.kind === "performed"
            ? {
                kind: "granted",
                grant: {
                  actorId: guarded.result.signedInUserId,
                  authorizedBy: guarded.authorized_by?.user_id,
                },
              }
            : { kind: "refused", refusal: guarded };
        },
      },
    },
    { lineId, adjustment: toManualAdjustmentValue(adjustment), reason },
  );
  if (outcome.kind !== "changed") {
    return outcome;
  }
  return {
    kind: "changed",
    sale: toOpenSale(outcome, saleView(database, outcome.sale.actorId)),
    removed_sale_discount: outcome.removedSaleDiscount,
  };
}

export interface PreviewSaleLineAdjustmentRequest {
  lineId: string;
  adjustment: ManualAdjustmentRequest;
}

export async function previewSaleLineAdjustmentFor(
  { database, gate, now }: Pick<SaleRequestDeps, "database" | "gate" | "now">,
  { lineId, adjustment }: PreviewSaleLineAdjustmentRequest,
): Promise<PreviewSaleLineAdjustmentOutcome> {
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    previewSaleLineAdjustment(
      { ledger: saleLedger(database), clock: { now } },
      { actorId: signedInUserId, lineId, adjustment: toManualAdjustmentValue(adjustment) },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  return outcome.kind === "preview"
    ? {
        kind: "preview",
        discount_amount: outcome.discountAmount,
        line_total: outcome.lineTotal,
      }
    : outcome;
}

export interface ApplySaleDiscountRequest {
  discount: SaleDiscountRequest;
  reason: string;
  authorization?: Authorization | undefined;
}

type ApplySaleDiscountRefusal = Extract<
  ApplySaleDiscountOutcome,
  { kind: "not_signed_in" | "lacks_permission" | AuthorizationRefusal["kind"] }
>;

function toSaleDiscountValue(discount: SaleDiscountRequest): SaleDiscountValue {
  return discount.kind === "PERCENT"
    ? { kind: "PERCENT", percent: discount.value }
    : { kind: "AMOUNT", amount: discount.value };
}

export async function applySaleDiscountFor(
  { database, gate, now }: Pick<SaleRequestDeps, "database" | "gate" | "now">,
  { discount, reason, authorization }: ApplySaleDiscountRequest,
): Promise<ApplySaleDiscountOutcome> {
  const outcome = await applySaleDiscount<ApplySaleDiscountGrant, ApplySaleDiscountRefusal>(
    {
      ledger: saleLedger(database),
      clock: { now },
      authority: {
        async authorize(): Promise<
          OperationAuthorization<ApplySaleDiscountGrant, ApplySaleDiscountRefusal>
        > {
          const guarded = await gate.runAuthorized(
            { kind: "apply_sale_discount" },
            authorization,
            async (actor) => actor,
          );
          return guarded.kind === "performed"
            ? {
                kind: "granted",
                grant: {
                  actorId: guarded.result.signedInUserId,
                  authorizedBy: guarded.authorized_by?.user_id,
                },
              }
            : { kind: "refused", refusal: guarded };
        },
      },
    },
    { discount: toSaleDiscountValue(discount), reason },
  );
  if (outcome.kind !== "applied") {
    return outcome;
  }
  return {
    kind: "applied",
    sale: toOpenSale(outcome, saleView(database, outcome.sale.actorId)),
  };
}

export interface PreviewSaleDiscountRequest {
  discount: SaleDiscountRequest;
}

export async function previewSaleDiscountFor(
  { database, gate, now }: Pick<SaleRequestDeps, "database" | "gate" | "now">,
  { discount }: PreviewSaleDiscountRequest,
): Promise<PreviewSaleDiscountOutcome> {
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    previewSaleDiscount(
      { ledger: saleLedger(database), clock: { now } },
      { actorId: signedInUserId, discount: toSaleDiscountValue(discount) },
    ),
  );
  if (guarded.kind !== "performed") {
    return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
  }
  const outcome = guarded.result;
  return outcome.kind === "preview"
    ? {
        kind: "preview",
        subtotal: outcome.subtotal,
        discount_amount: outcome.saleDiscountAmount,
        total: outcome.total,
      }
    : outcome;
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
  const { outcome, view } = guarded.result;
  return outcome.kind === "removed"
    ? {
        kind: "removed",
        sale: toOpenSale(outcome, view),
        removed_sale_discount: outcome.removedSaleDiscount,
      }
    : { kind: outcome.kind };
}

export async function cancelSaleFor({
  database,
  gate,
  now,
}: Pick<SaleRequestDeps, "database" | "gate" | "now">): Promise<CancelSaleOutcome> {
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    cancelSale({ ledger: saleLedger(database), clock: { now } }, { actorId: signedInUserId }),
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

type ConfirmedByHandCharge = typeof chargeSaleByTransfer | typeof chargeSaleOnStandaloneTerminal;

async function chargeSaleConfirmedByHandFor(
  { database, gate, now, ids, readOutboxChainKey }: OutboxSaleRequestDeps,
  { saleId, amount }: ChargeSaleByTransferRequest,
  charge: ConfirmedByHandCharge,
): Promise<ChargeSaleByTransferOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const guarded = await gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    charge(
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

export function chargeSaleByTransferFor(
  deps: OutboxSaleRequestDeps,
  request: ChargeSaleByTransferRequest,
): Promise<ChargeSaleByTransferOutcome> {
  return chargeSaleConfirmedByHandFor(deps, request, chargeSaleByTransfer);
}

export function chargeSaleOnStandaloneTerminalFor(
  deps: OutboxSaleRequestDeps,
  request: ChargeSaleOnStandaloneTerminalRequest,
): Promise<ChargeSaleOnStandaloneTerminalOutcome> {
  return chargeSaleConfirmedByHandFor(deps, request, chargeSaleOnStandaloneTerminal);
}
