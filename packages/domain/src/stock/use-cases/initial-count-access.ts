import { registerOperationAccess } from "../../register/index.js";
import { initialCountOffered } from "../model/initial-count.js";
import type { InitialCountTransaction } from "./initial-count-ledger.js";

export type InitialCountRefusal = { kind: "not_permitted" } | { kind: "not_offered" };

export function isInitialCountOffered(tx: InitialCountTransaction): boolean {
  return initialCountOffered({
    branchFirstSessionOpened: tx.branchFirstSessionOpened(),
    ownSessionEverOpened: tx.ownSessionEverOpened(),
  });
}

export function mayRecordInitialInventory(tx: InitialCountTransaction, actorId: string): boolean {
  return (
    registerOperationAccess(
      { kind: "record_initial_inventory" },
      { id: actorId, access: tx.actorAccess(actorId) },
    ).kind === "permitted"
  );
}

export function initialCountRefusal(
  tx: InitialCountTransaction,
  actorId: string,
): InitialCountRefusal | undefined {
  if (!mayRecordInitialInventory(tx, actorId)) {
    return { kind: "not_permitted" };
  }
  return isInitialCountOffered(tx) ? undefined : { kind: "not_offered" };
}
