import { contingencyLeftEvent } from "../model/contingency-events.js";
import { contingencyIntervalEnd } from "../model/contingency-interval.js";
import type { IdGenerator } from "./cash-ledger.js";
import type { ContingencyLedger } from "./contingency-ledger.js";

export interface CloseInterruptedContingencyPorts {
  ledger: ContingencyLedger;
  ids: IdGenerator;
}

export type CloseInterruptedContingencyOutcome =
  | { kind: "unavailable" }
  | { kind: "none_open" }
  | { kind: "closed"; intervalId: string };

export function closeInterruptedContingency({
  ledger,
  ids,
}: CloseInterruptedContingencyPorts): CloseInterruptedContingencyOutcome {
  return ledger.transaction<CloseInterruptedContingencyOutcome>((tx) => {
    const registerId = tx.registerId();
    if (registerId === undefined) {
      return { kind: "unavailable" };
    }
    const open = tx.openInterval();
    if (open === undefined) {
      return { kind: "none_open" };
    }
    const endedAt = contingencyIntervalEnd(open.startedAt, open.lastSeenAt);
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
    return { kind: "closed", intervalId: open.id };
  });
}
