import type { RoleAccess } from "../../permissions/index.js";
import type { CashSessionStanding, ClockMark } from "../model/clock-correction.js";
import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";
import type { ClockCorrectionReadings } from "../model/register-clock.js";

export interface TaxAuthorityFloor {
  pointOfSale: number;
  documentType: FiscalDocumentType;
  lastIssuedOn: string;
}

export interface RegisterClockGuardReader {
  correctorAccess(userId: string): RoleAccess | undefined;
  clockMarks(): readonly ClockMark[];
  taxAuthorityFloor(): TaxAuthorityFloor | null;
  cashSessionStanding(): CashSessionStanding;
  clockCorrectionRecordedIn(period: string): boolean;
  clockCorrectionsOf(
    pointOfSale: number,
    documentType: FiscalDocumentType,
  ): readonly ClockCorrectionReadings[];
}
