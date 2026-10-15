import { registerOperationAccess } from "../../register/index.js";
import type { Clock } from "../../shared/index.js";
import { clockCorrectionPeriodKey, clockLoweringsFor } from "../model/clock-correction.js";
import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";
import { isBeforeTaxAuthorityLastIssuedDay, isBehindClockMark } from "../model/register-clock.js";
import type { RegisterClockGuardReader } from "./register-clock-guard-ports.js";

export interface ClockGuardBlock {
  pointOfSale: number;
  documentType: FiscalDocumentType;
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
    floor !== null && isBeforeTaxAuthorityLastIssuedDay(reading, floor.lastIssuedOn);
  const isFloorOf = (pointOfSale: number, documentType: FiscalDocumentType) =>
    floor !== null && floor.pointOfSale === pointOfSale && floor.documentType === documentType;

  const blocks: ClockGuardBlock[] = marks
    .filter(
      ({ pointOfSale, documentType, reading: mark }) =>
        isBehindClockMark(reading, mark) || (floorBehind && isFloorOf(pointOfSale, documentType)),
    )
    .map(({ pointOfSale, documentType, reading: latestReading }) => ({
      pointOfSale,
      documentType,
      latestReading,
      taxAuthorityLastIssuedOn: isFloorOf(pointOfSale, documentType)
        ? (floor?.lastIssuedOn ?? null)
        : null,
    }));
  if (
    floor !== null &&
    floorBehind &&
    !blocks.some((b) => isFloorOf(b.pointOfSale, b.documentType))
  ) {
    blocks.push({
      pointOfSale: floor.pointOfSale,
      documentType: floor.documentType,
      latestReading: null,
      taxAuthorityLastIssuedOn: floor.lastIssuedOn,
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
