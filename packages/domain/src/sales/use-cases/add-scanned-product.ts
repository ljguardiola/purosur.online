import type { Sale, SaleWithLines } from "../model/sale.js";
import { addUnitToLine, newSaleLine } from "../model/sale-line.js";
import type {
  Clock,
  IdGenerator,
  RegisterIdentity,
  SaleLedger,
  SaleLedgerTransaction,
} from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export interface AddScannedProductInput {
  actorId: string;
  code: string;
}

export interface AddScannedProductPorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type AddScannedProductOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "installation_revoked" }
  | { kind: "unavailable" }
  | { kind: "unknown_code" }
  | { kind: "sold_by_weight"; productName: string }
  | { kind: "no_price"; productName: string }
  | { kind: "added"; sale: SaleWithLines };

export function addScannedProduct(
  { ledger, clock, ids }: AddScannedProductPorts,
  { actorId, code }: AddScannedProductInput,
): AddScannedProductOutcome {
  return ledger.transaction<AddScannedProductOutcome>((tx) => {
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

    const product = tx.activeProductByBarcode(code);
    if (!product) {
      return { kind: "unknown_code" };
    }
    if (product.saleUnit === "KG") {
      return { kind: "sold_by_weight", productName: product.name };
    }
    const moment = clock.now();
    const price = tx.priceAt(product.id, moment);
    if (!price) {
      return { kind: "no_price", productName: product.name };
    }

    const sale = isOpenSale(target)
      ? target
      : startSale(tx, ids.next(), target, session.id, actorId, moment);
    const line = sale.lines.find((candidate) => candidate.productId === product.id);
    if (line) {
      const updated = addUnitToLine(line);
      tx.recordLineQuantity(updated);
      return {
        kind: "added",
        sale: { ...sale, lines: sale.lines.map((each) => (each === line ? updated : each)) },
      };
    }
    const added = newSaleLine(ids.next(), product, price);
    tx.recordSaleLine(sale.id, added);
    return { kind: "added", sale: { ...sale, lines: [...sale.lines, added] } };
  });
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
