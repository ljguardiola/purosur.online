import { contingencyLeftEvent } from "../model/contingency-events.js";
import { replacedRegisterContingencyEnd } from "../model/contingency-interval.js";
import type { IdGenerator } from "./cash-ledger.js";
import type { ContingencyLedger } from "./contingency-ledger.js";

export interface ClosePredecessorContingencyPorts {
  ledger: ContingencyLedger;
  ids: IdGenerator;
}

export type ClosePredecessorContingencyOutcome =
  | { kind: "unavailable" }
  | { kind: "awaiting_replenishment" }
  | { kind: "closed"; intervalIds: string[] };

export function closePredecessorContingency({
  ledger,
  ids,
}: ClosePredecessorContingencyPorts): ClosePredecessorContingencyOutcome {
  return ledger.transaction<ClosePredecessorContingencyOutcome>((tx) => {
    const registerId = tx.registerId();
    if (registerId === undefined) {
      return { kind: "unavailable" };
    }
    if (tx.replenishmentPending()) {
      return { kind: "awaiting_replenishment" };
    }
    const intervalIds: string[] = [];
    for (const open of tx.predecessorOpenIntervals()) {
      const endedAt = replacedRegisterContingencyEnd(open);
      tx.recordClosedInterval(open.id, endedAt);
      tx.appendOutboxEvent(
        contingencyLeftEvent({
          eventId: ids.next(),
          registerId,
          intervalId: open.id,
          startedAt: open.startedAt,
          endedAt,
        }),
      );
      intervalIds.push(open.id);
    }
    return { kind: "closed", intervalIds };
  });
}
