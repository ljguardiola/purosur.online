import type { ChargeRefusal } from "../../fiscal/index.js";
import { discountAppliesOn } from "../../pricing/index.js";
import { argentinaCalendarDay } from "../../shared/index.js";
import type { LinePromotion, Sale, SaleWithLines } from "../model/sale.js";
import { addUnitToLine, newSaleLine } from "../model/sale-line.js";
import { saleChargeRefusal } from "./sale-charge-refusal.js";
import type {
  Clock,
  IdGenerator,
  RegisterIdentity,
  SaleLedgerTransaction,
  SellableProduct,
} from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export type AddProductToSaleOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "installation_revoked" }
  | { kind: "unavailable" }
  | { kind: "product_not_found" }
  | { kind: "sold_by_weight"; productName: string }
  | { kind: "no_price"; productName: string }
  | { kind: "added"; sale: SaleWithLines; chargeRefusal: ChargeRefusal | undefined };

export interface AddProductToSaleRequest {
  actorId: string;
  clock: Clock;
  ids: IdGenerator;
  findProduct: (tx: SaleLedgerTransaction) => SellableProduct | undefined;
}

export function addProductToSale(
  tx: SaleLedgerTransaction,
  { actorId, clock, ids, findProduct }: AddProductToSaleRequest,
): AddProductToSaleOutcome {
  const session = sellingSession(tx, actorId);
  if (isRefusal(session)) {
    return session;
  }

  const existing = tx.openSale(session.id);
  if (!existing && tx.installationRevoked()) {
    return { kind: "installation_revoked" };
  }
  const target = existing ?? tx.registerIdentity();
  if (!target) {
    return { kind: "unavailable" };
  }

  const product = findProduct(tx);
  if (!product) {
    return { kind: "product_not_found" };
  }
  if (product.saleUnit === "KG") {
    return { kind: "sold_by_weight", productName: product.name };
  }
  const line = existing?.lines.find((candidate) => candidate.productId === product.id);
  if (existing && line) {
    const updated = addUnitToLine(line);
    tx.recordLineQuantity(updated);
    return added(tx, clock.now(), {
      ...existing,
      lines: existing.lines.map((each) => (each === line ? updated : each)),
    });
  }
  const moment = clock.now();
  const price = tx.priceAt(product.id, moment);
  if (!price) {
    return { kind: "no_price", productName: product.name };
  }

  const sale = isOpenSale(target) ? target : startSale(tx, ids.next(), target, session.id, actorId);
  const addedLine = newSaleLine(
    ids.next(),
    product,
    price,
    validPromotions(tx, product.id, moment),
  );
  tx.recordSaleLine(sale.id, addedLine);
  return added(tx, moment, { ...sale, lines: [...sale.lines, addedLine] });
}

function added(
  tx: SaleLedgerTransaction,
  moment: Date,
  sale: SaleWithLines,
): AddProductToSaleOutcome {
  return { kind: "added", sale, chargeRefusal: saleChargeRefusal(tx, sale, moment) };
}

function validPromotions(
  tx: SaleLedgerTransaction,
  productId: string,
  moment: Date,
): LinePromotion[] {
  const day = argentinaCalendarDay(moment);
  return tx
    .promotionsTargeting(productId)
    .filter((promotion) => discountAppliesOn(promotion, day))
    .map(({ id, benefit }) => ({ id, benefit }));
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
  return { ...sale, lines: [] };
}

function isOpenSale(target: SaleWithLines | RegisterIdentity): target is SaleWithLines {
  return "lines" in target;
}
