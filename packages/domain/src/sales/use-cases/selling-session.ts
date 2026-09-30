import { holdsPermission } from "../../access/index.js";
import type { SaleLedgerTransaction, SellingSession } from "./sale-ledger.js";

export type SellingSessionRefusal = { kind: "not_permitted" } | { kind: "no_open_session" };

export function sellingSession(
  tx: SaleLedgerTransaction,
  actorId: string,
): SellingSession | SellingSessionRefusal {
  const access = tx.sellerAccess(actorId);
  if (!access || !holdsPermission(access, "sell_and_charge")) {
    return { kind: "not_permitted" };
  }
  const session = tx.openSession();
  if (!session) {
    return { kind: "no_open_session" };
  }
  if (session.openedBy !== actorId) {
    return { kind: "not_permitted" };
  }
  return session;
}

export function isRefusal(
  result: SellingSession | SellingSessionRefusal,
): result is SellingSessionRefusal {
  return "kind" in result;
}
