import type { Sale, SaleWithLines } from "../model/sale.js";
import { addUnitToLine, newSaleLine } from "../model/sale-line.js";
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
  | { kind: "added"; sale: SaleWithLines };

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
    return {
      kind: "added",
      sale: {
        ...existing,
        lines: existing.lines.map((each) => (each === line ? updated : each)),
      },
    };
  }
  const moment = clock.now();
  const price = tx.priceAt(product.id, moment);
  if (!price) {
    return { kind: "no_price", productName: product.name };
  }

  const sale = isOpenSale(target)
    ? target
    : startSale(tx, ids.next(), target, session.id, actorId, moment);
  const added = newSaleLine(ids.next(), product, price);
  tx.recordSaleLine(sale.id, added);
  return { kind: "added", sale: { ...sale, lines: [...sale.lines, added] } };
}

function startSale(
  tx: SaleLedgerTransaction,
  id: string,
  identity: RegisterIdentity,
  sessionId: string,
  actorId: string,
  occurredAt: Date,
): SaleWithLines {
  const sale: Sale = {
    id,
    registerId: identity.registerId,
    deviceId: identity.deviceId,
    sessionId,
    actorId,
    state: "OPEN",
    occurredAt,
  };
  tx.recordOpenedSale(sale);
  return { ...sale, lines: [] };
}

function isOpenSale(target: SaleWithLines | RegisterIdentity): target is SaleWithLines {
  return "lines" in target;
}
