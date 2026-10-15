import type { ClockCorrectionAlertState } from "../model/clock-correction.js";
import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";

export interface BranchClockCorrection {
  eventId: string;
  correctedAt: Date;
  registerId: string;
  registerName: string;
  pointOfSale: number;
  documentType: FiscalDocumentType;
  actorId: string;
  actorFirstName: string;
  previousReading: Date;
  correctedReading: Date;
  alertState: ClockCorrectionAlertState;
}

export interface ClockCorrectionReader {
  listBranchClockCorrections(locationId: string): Promise<BranchClockCorrection[]>;
}
