import { registerOperationAccess } from "../../register/index.js";
import type { Clock } from "../../shared/index.js";
import {
  type ClockMark,
  clockCorrectionPeriodKey,
  clockLoweringsFor,
} from "../model/clock-correction.js";
import {
  isBeforeTaxAuthorityLastIssuedDay,
  isBehindClockMark,
  isInClockCorrectionLapse,
} from "../model/register-clock.js";
import type { RegisterClockGuardReader } from "./register-clock-guard-ports.js";

export interface ClockGuardBlock {
  pointOfSale: number;
  documentType: ClockMark["documentType"];
  latestReading: Date | null;
  taxAuthorityLastIssuedOn: string | null;
}

type ClockCorrectionAvailability = "available" | "not_behind" | "already_corrected_in_period";

export interface RegisterClockGuardState {
  reading: Date;
  blocks: ClockGuardBlock[];
  mayCorrect: boolean;
  correction: ClockCorrectionAvailability;
}

function clockCorrectionAvailability(
  reader: RegisterClockGuardReader,
  marks: readonly ClockMark[],
  reading: Date,
): ClockCorrectionAvailability {
  if (clockLoweringsFor(marks, reading).length === 0) {
    return "not_behind";
  }
  return reader.clockCorrectionRecordedIn(clockCorrectionPeriodKey(reader.cashSessionStanding()))
    ? "already_corrected_in_period"
    : "available";
}

export interface ReadRegisterClockGuardPorts {
  reader: RegisterClockGuardReader;
  clock: Clock;
}

export function readRegisterClockGuard(
  { reader, clock }: ReadRegisterClockGuardPorts,
  { userId }: { userId: string | undefined },
): RegisterClockGuardState {
  const reading = clock.now();
  const marks = reader.clockMarks();
  const floor = reader.taxAuthorityFloor();
  const floorBehind =
    floor !== null &&
    isBeforeTaxAuthorityLastIssuedDay(reading, floor.lastIssuedOn) &&
    !isInClockCorrectionLapse({
      reading,
      taxAuthorityLastIssuedOn: floor.lastIssuedOn,
      latestCorrection: reader.latestClockCorrectionOf(floor.pointOfSale, floor.documentType),
    })
      ? floor
      : null;
  const isFloorOf = (pointOfSale: number) =>
    floorBehind !== null && floorBehind.pointOfSale === pointOfSale;

  const blocks: ClockGuardBlock[] = marks
    .filter(
      ({ pointOfSale, reading: mark }) =>
        isBehindClockMark(reading, mark) || (floorBehind !== null && isFloorOf(pointOfSale)),
    )
    .map(({ pointOfSale, documentType, reading: latestReading }) => ({
      pointOfSale,
      documentType,
      latestReading,
      taxAuthorityLastIssuedOn: isFloorOf(pointOfSale) ? (floorBehind?.lastIssuedOn ?? null) : null,
    }));
  if (floorBehind !== null && !blocks.some(({ pointOfSale }) => isFloorOf(pointOfSale))) {
    blocks.push({
      pointOfSale: floorBehind.pointOfSale,
      documentType: floorBehind.documentType,
      latestReading: null,
      taxAuthorityLastIssuedOn: floorBehind.lastIssuedOn,
    });
  }

  return {
    reading,
    blocks,
    mayCorrect:
      userId !== undefined &&
      registerOperationAccess(
        { kind: "correct_register_clock" },
        { id: userId, access: reader.correctorAccess(userId) },
      ).kind === "permitted",
    correction: clockCorrectionAvailability(reader, marks, reading),
  };
}
