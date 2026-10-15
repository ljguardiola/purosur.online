import { type ClockCorrectionBody, clockCorrectionListSchema } from "@purosur/contracts";
import type { ClockCorrectionAlertState } from "@purosur/domain";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudList } from "./fiscal-api-request";

export type ClockCorrection = {
  id: string;
  correctedAt: string;
  registerId: string;
  registerName: string;
  pointOfSaleNumber: number;
  actorFirstName: string;
  previousReading: string;
  correctedReading: string;
  alertState: ClockCorrectionAlertState;
};

export type FetchClockCorrectionsOutcome = CloudReadOutcome<ClockCorrection[]>;

function clockCorrectionFromWire(row: ClockCorrectionBody): ClockCorrection {
  return {
    id: row.id,
    correctedAt: row.corrected_at,
    registerId: row.register_id,
    registerName: row.register_name,
    pointOfSaleNumber: row.point_of_sale_number,
    actorFirstName: row.actor_first_name,
    previousReading: row.previous_reading,
    correctedReading: row.corrected_reading,
    alertState: row.alert_state,
  };
}

export function fetchClockCorrections(): Promise<FetchClockCorrectionsOutcome> {
  return readCloudList("/api/registers/clock-corrections", (body) =>
    clockCorrectionListSchema.safeParse(body).data?.map(clockCorrectionFromWire),
  );
}
