import type { ContingencyLedger } from "./contingency-ledger.js";

export interface RecordRegisterSeenUnenrolledPorts {
  ledger: ContingencyLedger;
}

export type RecordRegisterSeenUnenrolledOutcome =
  | { kind: "recorded" }
  | { kind: "already_recorded" }
  | { kind: "enrolled" };

export function recordRegisterSeenUnenrolled({
  ledger,
}: RecordRegisterSeenUnenrolledPorts): RecordRegisterSeenUnenrolledOutcome {
  return ledger.transaction<RecordRegisterSeenUnenrolledOutcome>((tx) => {
    if (tx.registerId() !== undefined) {
      return { kind: "enrolled" };
    }
    if (tx.seenUnenrolled()) {
      return { kind: "already_recorded" };
    }
    tx.recordSeenUnenrolled();
    return { kind: "recorded" };
  });
}
