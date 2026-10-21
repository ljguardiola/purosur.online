import {
  isLockedToAnother,
  registerOperationAccess,
  restorationStanding,
} from "../../register/index.js";
import type { SaleLedgerTransaction, SellingSession } from "./sale-ledger.js";

export type SellingSessionRefusal =
  | { kind: "not_permitted" }
  | { kind: "restoration_in_progress" }
  | { kind: "no_open_session" };

export function sellingSession(
  tx: SaleLedgerTransaction,
  actorId: string,
): SellingSession | SellingSessionRefusal {
  const seller = { id: actorId, access: tx.sellerAccess(actorId) };
  if (registerOperationAccess({ kind: "sell" }, seller).kind !== "permitted") {
    return { kind: "not_permitted" };
  }
  if (restorationStanding(tx.restorationEvidence()).kind !== "completed") {
    return { kind: "restoration_in_progress" };
  }
  const session = tx.openSession();
  if (!session) {
    return { kind: "no_open_session" };
  }
  if (isLockedToAnother(session, actorId)) {
    return { kind: "not_permitted" };
  }
  return session;
}

export function isRefusal(
  result: SellingSession | SellingSessionRefusal,
): result is SellingSessionRefusal {
  return "kind" in result;
}
