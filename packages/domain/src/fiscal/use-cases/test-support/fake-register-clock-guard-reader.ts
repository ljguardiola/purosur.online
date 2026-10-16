import type { RoleAccess } from "../../../permissions/index.js";
import type { CashSessionStanding, ClockMark } from "../../model/clock-correction.js";
import type { RegisterClockGuardReader, TaxAuthorityFloor } from "../register-clock-guard-ports.js";

export interface FakeRegisterClockGuardState {
  accesses: Record<string, RoleAccess>;
  marks: ClockMark[];
  floor: TaxAuthorityFloor | null;
  standing: CashSessionStanding;
  periodsWithCorrection: string[];
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
  } = state;
  return {
    correctorAccess: (userId) => accesses[userId],
    clockMarks: () => marks.map((mark) => ({ ...mark })),
    taxAuthorityFloor: () => floor,
    cashSessionStanding: () => standing,
    clockCorrectionRecordedIn: (period) => periodsWithCorrection.includes(period),
  };
}
