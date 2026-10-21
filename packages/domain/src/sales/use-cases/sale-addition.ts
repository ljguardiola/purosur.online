import type { ChargeRefusal } from "../../fiscal/index.js";
import { paidOrdersSellingRefusal } from "../../payments/index.js";
import { discountAppliesOn } from "../../pricing/index.js";
import type { Clock } from "../../shared/index.js";
import { argentinaCalendarDay } from "../../shared/index.js";
import { type OpenSaleStanding, openSaleStanding } from "../model/open-sale-standing.js";
import type { LinePromotion, Sale, SaleLine, SaleWithLines } from "../model/sale.js";
import { amountToCharge } from "../model/sale-discount.js";
import { withoutSaleDiscount } from "./remove-sale-discount.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type {
  IdGenerator,
  RegisterIdentity,
  SaleLedgerTransaction,
  SellingSession,
} from "./sale-ledger.js";
import { saleLinesLocked } from "./sale-lines-locked.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export type SaleAdditionRefusal =
  | { kind: "not_permitted" }
  | { kind: "restoration_in_progress" }
  | { kind: "no_open_session" }
  | { kind: "installation_revoked" }
  | { kind: "local_database_damaged" }
  | { kind: "battery_critical" }
  | { kind: "disk_space_short" }
  | { kind: "paid_order_without_sale" }
  | { kind: "paid_orders_not_checked" }
  | { kind: "unavailable" }
  | { kind: "sale_has_payments" };

export type AddedLineOutcome = {
  kind: "added";
  removedManualDiscount: boolean;
  removedSaleDiscount: boolean;
  sale: SaleWithLines;
  chargeRefusal: ChargeRefusal | undefined;
} & OpenSaleStanding;

export interface SaleAddition {
  actorId: string;
  session: SellingSession;
  existing: SaleWithLines | undefined;
  target: SaleWithLines | RegisterIdentity;
}

export function saleToAddTo(
  tx: SaleLedgerTransaction,
  actorId: string,
  clock: Clock,
): SaleAddition | SaleAdditionRefusal {
  const session = sellingSession(tx, actorId);
  if (isRefusal(session)) {
    return session;
  }

  const existing = tx.openSale(session.id);
  if (existing && saleLinesLocked(tx, existing.id, clock.now())) {
    return { kind: "sale_has_payments" };
  }
  if (!existing && tx.installationRevoked()) {
    return { kind: "installation_revoked" };
  }
  if (!existing && tx.localDatabaseDamaged()) {
    return { kind: "local_database_damaged" };
  }
  if (!existing && tx.newSalesStoppedByBattery()) {
    return { kind: "battery_critical" };
  }
  if (!existing && tx.newSalesStoppedByDisk()) {
    return { kind: "disk_space_short" };
  }
  const paidOrdersRefusal = paidOrdersSellingRefusal(tx.paidOrdersWithoutSale(), {
    openSale: !!existing,
    discovery: tx.paidOrderDiscovery(),
  });
  if (paidOrdersRefusal !== undefined) {
    return { kind: paidOrdersRefusal };
  }
  const target = existing ?? tx.registerIdentity();
  if (!target) {
    return { kind: "unavailable" };
  }
  return { actorId, session, existing, target };
}

export function isSaleAdditionRefusal(
  result: SaleAddition | SaleAdditionRefusal,
): result is SaleAdditionRefusal {
  return "kind" in result;
}

export function addLineToSale(
  tx: SaleLedgerTransaction,
  addition: SaleAddition,
  ids: IdGenerator,
  moment: Date,
  newLine: (lineId: string) => SaleLine,
): AddedLineOutcome {
  const { actorId, session, target } = addition;
  const sale = isOpenSale(target) ? target : startSale(tx, ids.next(), target, session.id, actorId);
  const line = newLine(ids.next());
  tx.recordSaleLine(sale.id, line);
  return added(tx, moment, { ...sale, lines: [...sale.lines, line] }, false);
}

export function added(
  tx: SaleLedgerTransaction,
  moment: Date,
  withLine: SaleWithLines,
  removedManualDiscount: boolean,
): AddedLineOutcome {
  const { sale, removedSaleDiscount } = withoutSaleDiscount(tx, withLine);
  return {
    kind: "added",
    removedManualDiscount,
    removedSaleDiscount,
    sale,
    chargeRefusal: saleChargeRefusal(tx, sale, moment),
    ...openSaleStanding(
      amountToCharge(sale),
      tx.salePayments(sale.id),
      tx.pendingMercadoPagoPaymentsOf(sale.id),
      moment,
    ),
  };
}

export function validPromotions(
  tx: SaleLedgerTransaction,
  productId: string,
  moment: Date,
): LinePromotion[] {
  const day = argentinaCalendarDay(moment);
  return tx
    .promotionsTargeting(productId)
    .filter((promotion) => discountAppliesOn(promotion, day))
    .map(({ id, name, benefit }) => ({ id, name, benefit }));
}

function startSale(
  tx: SaleLedgerTransaction,
  id: string,
  identity: RegisterIdentity,
  sessionId: string,
  actorId: string,
): SaleWithLines {
  const sale: Sale = {
    id,
    registerId: identity.registerId,
    deviceId: identity.deviceId,
    sessionId,
    actorId,
    state: "OPEN",
  };
  tx.recordOpenedSale(sale);
  return { ...sale, saleDiscount: null, lines: [] };
}

function isOpenSale(target: SaleWithLines | RegisterIdentity): target is SaleWithLines {
  return "lines" in target;
}
