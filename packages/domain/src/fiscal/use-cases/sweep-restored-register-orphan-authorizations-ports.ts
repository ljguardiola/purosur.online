import type { Clock } from "../../shared/index.js";
import type { NumberingFreeze } from "../model/numbering-conflict.js";
import type { RecordedAuthorizationRequest } from "../model/orphan-authorization.js";
import type { OrphanRegularizationLane } from "./orphan-authorization-ports.js";
import type { IdGenerator } from "./sale-authorization-ports.js";

export interface UnrecordedSaleRequest extends RecordedAuthorizationRequest {
  fiscalDocumentId: string;
  saleId: string;
}

export interface RestoredRegisterOrphanLane extends OrphanRegularizationLane {
  numberingFreeze(): Promise<NumberingFreeze | null>;
  /**
   * The point of sale's authorization requests whose sale is not recorded. The adapter may leave
   * out the ones that cannot be authorized; the domain decides which are.
   */
  requestsWithoutRecordedSale(): Promise<UnrecordedSaleRequest[]>;
}

export interface RestoredRegisterOrphanLanes {
  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: RestoredRegisterOrphanLane) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RegisterFiscalPointsOfSale {
  fiscalPointsOfSaleOf(registerId: string): Promise<number[]>;
}

export interface SweepRestoredRegisterOrphanAuthorizationsPorts {
  points: RegisterFiscalPointsOfSale;
  lanes: RestoredRegisterOrphanLanes;
  clock: Clock;
  ids: IdGenerator;
}
