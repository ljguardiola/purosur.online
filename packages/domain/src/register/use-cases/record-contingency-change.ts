import type { Clock } from "../../shared/index.js";
import { contingencyEnteredEvent, contingencyLeftEvent } from "../model/contingency-events.js";
import { contingencyIntervalEnd } from "../model/contingency-interval.js";
import type { IdGenerator } from "./cash-ledger.js";
import type { ContingencyLedger } from "./contingency-ledger.js";

export interface RecordContingencyChangePorts {
  ledger: ContingencyLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type RecordContingencyChangeOutcome =
  | { kind: "unavailable" }
  | { kind: "entered"; intervalId: string }
  | { kind: "left"; intervalId: string }
  | { kind: "refreshed"; intervalId: string }
  | { kind: "unchanged" };

export function recordContingencyChange({
  ledger,
  clock,
  ids,
}: RecordContingencyChangePorts): RecordContingencyChangeOutcome {
  return ledger.transaction<RecordContingencyChangeOutcome>((tx) => {
    const registerId = tx.registerId();
    if (registerId === undefined) {
      return { kind: "unavailable" };
    }
    const counts = tx.emittingInContingencyTime() && tx.cashSessionOpen();
    const open = tx.openInterval();
    const now = clock.now();

    if (open === undefined) {
      if (!counts) {
        return { kind: "unchanged" };
      }
      const intervalId = ids.next();
      tx.recordOpenedInterval({ id: intervalId, startedAt: now });
      tx.appendOutboxEvent(
        contingencyEnteredEvent({ eventId: ids.next(), registerId, intervalId, startedAt: now }),
      );
      return { kind: "entered", intervalId };
    }
    if (counts) {
      tx.recordIntervalSeen(open.id, new Date(Math.max(now.getTime(), open.lastSeenAt.getTime())));
      return { kind: "refreshed", intervalId: open.id };
    }
    const endedAt = contingencyIntervalEnd(open.startedAt, now);
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
    return { kind: "left", intervalId: open.id };
  });
}
