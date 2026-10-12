import { isInitialCountOffered, mayRecordInitialInventory } from "./initial-count-access.js";
import type { InitialCountLedger } from "./initial-count-ledger.js";
import type { InitialCountLineView } from "./record-initial-count-line.js";

export type ReadInitialCountOutcome =
  | { kind: "not_permitted" }
  | { kind: "read"; offered: boolean; lines: InitialCountLineView[] };

function compareConfirmation(
  a: { confirmedAt: Date; movementId: string },
  b: { confirmedAt: Date; movementId: string },
): number {
  return (
    a.confirmedAt.getTime() - b.confirmedAt.getTime() ||
    (a.movementId < b.movementId ? -1 : a.movementId > b.movementId ? 1 : 0)
  );
}

export function readInitialCount(
  { ledger }: { ledger: InitialCountLedger },
  { actorId }: { actorId: string },
): ReadInitialCountOutcome {
  return ledger.transaction<ReadInitialCountOutcome>((tx) => {
    if (!mayRecordInitialInventory(tx, actorId)) {
      return { kind: "not_permitted" };
    }
    const lines = tx
      .notWithdrawnInitialCountLines()
      .sort(compareConfirmation)
      .map(({ confirmedAt: _confirmedAt, withdrawn: _withdrawn, ...line }) => line);
    return { kind: "read", offered: isInitialCountOffered(tx), lines };
  });
}
