import type { RoleAccess } from "../../permissions/index.js";
import type { OutboxEventDraft } from "../../shared/index.js";
import type { CashSessionStanding, ClockLowering, ClockMark } from "../model/clock-correction.js";
import type { RegisterClockGuardReader } from "./register-clock-guard-ports.js";

export interface ClockCorrectionRecord {
  period: string;
  registerId: string;
  actorId: string;
  lowering: ClockLowering;
}

export interface ClockCorrectionLedger {
  transaction<TOutcome>(work: (tx: ClockCorrectionTransaction) => TOutcome): TOutcome;
}

export interface ClockCorrectionTransaction
  extends Pick<RegisterClockGuardReader, "taxAuthorityFloor" | "clockCorrectionsOf"> {
  correctorAccess(userId: string): RoleAccess | undefined;
  registerId(): string | undefined;
  cashSessionStanding(): CashSessionStanding;
  clockMarks(): readonly ClockMark[];
  clockCorrectionRecordedIn(period: string): boolean;
  lowerClockMark(lowering: ClockLowering): void;
  recordClockCorrection(record: ClockCorrectionRecord): void;
  appendOutboxEvent(event: OutboxEventDraft): void;
}
