import type { RoleAccess } from "../../../permissions/index.js";
import type { CashSessionStanding, ClockMark } from "../../model/clock-correction.js";
import type { FiscalDocumentType } from "../../model/fiscal-rejection-standing.js";
import type { ClockCorrectionReadings } from "../../model/register-clock.js";
import type { RegisterClockGuardReader, TaxAuthorityFloor } from "../register-clock-guard-ports.js";

interface RecordedClockCorrection extends ClockCorrectionReadings {
  pointOfSale: number;
  documentType: FiscalDocumentType;
}

export interface FakeRegisterClockGuardState {
  accesses: Record<string, RoleAccess>;
  marks: ClockMark[];
  floor: TaxAuthorityFloor | null;
  standing: CashSessionStanding;
  periodsWithCorrection: string[];
  corrections: RecordedClockCorrection[];
}

export function fakeRegisterClockGuardReader(
  state: Partial<FakeRegisterClockGuardState> = {},
): RegisterClockGuardReader {
  const {
    accesses = {},
    marks = [],
    floor = null,
    standing = { openSessionId: null, lastClosedSessionId: null },
    periodsWithCorrection = [],
    corrections = [],
  } = state;
  return {
    correctorAccess: (userId) => accesses[userId],
    clockMarks: () => marks.map((mark) => ({ ...mark })),
    taxAuthorityFloor: () => floor,
    cashSessionStanding: () => standing,
    clockCorrectionRecordedIn: (period) => periodsWithCorrection.includes(period),
    clockCorrectionsOf: (pointOfSale, documentType) =>
      corrections
        .filter(
          (correction) =>
            correction.pointOfSale === pointOfSale && correction.documentType === documentType,
        )
        .map(({ previousReading, correctedReading }) => ({ previousReading, correctedReading })),
  };
}
