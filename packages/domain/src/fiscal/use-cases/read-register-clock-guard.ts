import { registerOperationAccess } from "../../register/index.js";
import type { Clock } from "../../shared/index.js";
import {
  type ClockMark,
  clockCorrectionPeriodKey,
  clockLoweringsFor,
} from "../model/clock-correction.js";
import { isBeforeTaxAuthorityLastIssuedDay, isBehindClockMark } from "../model/register-clock.js";
import type { RegisterClockGuardReader } from "./register-clock-guard-ports.js";

export interface ClockGuardBlock {
  pointOfSale: number;
  documentType: ClockMark["documentType"];
  latestReading: Date | null;
  taxAuthorityLastIssuedOn: string | null;
}

export interface RegisterClockGuardState {
  reading: Date;
  blocks: ClockGuardBlock[];
  mayCorrect: boolean;
  correctionAvailable: boolean;
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
    floor !== null && isBeforeTaxAuthorityLastIssuedDay(reading, floor.lastIssuedOn) ? floor : null;
  const isFloorOf = (pointOfSale: number) => floor !== null && floor.pointOfSale === pointOfSale;

  const blocks: ClockGuardBlock[] = marks
    .filter(
      ({ pointOfSale, reading: mark }) =>
        isBehindClockMark(reading, mark) || (floorBehind !== null && isFloorOf(pointOfSale)),
    )
    .map(({ pointOfSale, documentType, reading: latestReading }) => ({
      pointOfSale,
      documentType,
      latestReading,
      taxAuthorityLastIssuedOn: isFloorOf(pointOfSale) ? (floor?.lastIssuedOn ?? null) : null,
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
    correctionAvailable:
      clockLoweringsFor(marks, reading).length > 0 &&
      !reader.clockCorrectionRecordedIn(clockCorrectionPeriodKey(reader.cashSessionStanding())),
  };
}
