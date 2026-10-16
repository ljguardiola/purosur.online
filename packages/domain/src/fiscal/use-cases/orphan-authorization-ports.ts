import type { Clock } from "../../shared/index.js";
import type {
  OrphanRegularization,
  RequestsAtNumber,
  SaleDocument,
} from "../model/orphan-authorization.js";
import type { WsaaTokenSource } from "./fiscal-document-authorization-ports.js";
import type { IdGenerator } from "./sale-authorization-ports.js";
import type { TaxAuthorityVoucherLookup } from "./unclear-outcome-ports.js";

export interface AuthorizationNumber {
  pointOfSale: number;
  number: number;
}

export interface OrphanStandingReader {
  requestsAtNumber(authorization: AuthorizationNumber): Promise<RequestsAtNumber>;
  otherDocumentsOfSale(saleId: string, fiscalDocumentId: string): Promise<SaleDocument[]>;
}

export interface OrphanRegularizationLane extends OrphanStandingReader {
  /**
   * Records the regularization all or nothing: a credit note request, or the alert together with
   * the task for a person.
   */
  recordOrphanRegularization(regularization: OrphanRegularization): Promise<void>;
}

export interface OrphanRegularizationLanes {
  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: OrphanRegularizationLane) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RegularizeOrphanAuthorizationPorts {
  lanes: OrphanRegularizationLanes;
  clock: Clock;
  ids: IdGenerator;
  tokens: WsaaTokenSource;
  vouchers: TaxAuthorityVoucherLookup;
}
