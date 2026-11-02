import type { Clock } from "../../shared/index.js";
import { contingencyReportingStartedEvent } from "../model/contingency-events.js";
import type { IdGenerator } from "./cash-ledger.js";
import type { ContingencyLedger } from "./contingency-ledger.js";

export interface StartContingencyReportingPorts {
  ledger: ContingencyLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type StartContingencyReportingOutcome =
  | { kind: "unavailable" }
  | { kind: "already_started" }
  | { kind: "started"; since: Date };

export function startContingencyReporting({
  ledger,
  clock,
  ids,
}: StartContingencyReportingPorts): StartContingencyReportingOutcome {
  return ledger.transaction<StartContingencyReportingOutcome>((tx) => {
    const registerId = tx.registerId();
    if (registerId === undefined) {
      return { kind: "unavailable" };
    }
    if (tx.reportingStartedAt() !== undefined) {
      return { kind: "already_started" };
    }
    const since = clock.now();
    tx.recordReportingStarted(since);
    tx.appendOutboxEvent(
      contingencyReportingStartedEvent({
        eventId: ids.next(),
        registerId,
        since,
        fromEnrollment: tx.seenUnenrolled(),
      }),
    );
    return { kind: "started", since };
  });
}
