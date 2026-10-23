import { type FiscalEmissionMode, isConnectivityGap } from "../../fiscal/index.js";
import {
  type ContingencyBackupOperation,
  needsContingencyBackupTicket,
  type OperationEventRange,
} from "../model/contingency-backup-ticket.js";
import type { RecordContingencyBackupTicketPorts } from "./contingency-backup-ticket-ports.js";

export interface RecordContingencyBackupTicketInput {
  operation: ContingencyBackupOperation;
  subjectId: string | null;
  modesAround: FiscalEmissionMode[];
  range: OperationEventRange;
}

export type RecordContingencyBackupTicketOutcome =
  | { kind: "recorded"; ticketId: string }
  | { kind: "recorded_without_key"; ticketId: string }
  | { kind: "not_in_gap" }
  | { kind: "no_events" };

export async function recordContingencyBackupTicket(
  { ids, clock, sealer, store }: RecordContingencyBackupTicketPorts,
  { operation, subjectId, modesAround, range }: RecordContingencyBackupTicketInput,
): Promise<RecordContingencyBackupTicketOutcome> {
  if (!modesAround.some(isConnectivityGap)) return { kind: "not_in_gap" };
  if (!needsContingencyBackupTicket({ modesAround, range })) return { kind: "no_events" };

  const id = ids.next();
  const sealing = await sealer.seal(id, range);
  const sealed =
    sealing.kind === "sealed" ? { keyVersion: sealing.keyVersion, qrCodes: sealing.qrCodes } : null;
  await store.transaction((tx) =>
    tx.recordTicket({ id, operation, subjectId, range, createdAt: clock.now(), sealed }),
  );
  return sealed === null
    ? { kind: "recorded_without_key", ticketId: id }
    : { kind: "recorded", ticketId: id };
}
