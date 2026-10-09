import type { Clock } from "../../shared/index.js";
import type { PushedEvent } from "../../sync/index.js";
import type { RealTimeAuthorizationAnswer } from "../model/real-time-authorization.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

export interface FiscalDocumentData {
  pointOfSale: number;
  number: number;
  issuedOn: string;
  total: number;
  buyerTaxStatusCode: number;
}

export interface AuthorizationRequestRecord extends FiscalDocumentData {
  fiscalDocumentId: string;
  registerId: string;
  saleId: string;
  notAfter: Date;
  saleEvent: PushedEvent;
  receivedAt: Date;
}

export class FiscalDocumentAlreadyRecorded extends Error {}

export interface RecordedAuthorizationRequest {
  answer: RealTimeAuthorizationAnswer | null;
}

export interface PointOfSaleLane {
  registerOwnsPointOfSale(registerId: string, pointOfSale: number): Promise<boolean>;
  recordedRequest(
    registerId: string,
    fiscalDocumentId: string,
  ): Promise<RecordedAuthorizationRequest | null>;
  recordRequest(request: AuthorizationRequestRecord): Promise<void>;
  recordAnswer(
    fiscalDocumentId: string,
    answer: RealTimeAuthorizationAnswer,
    answeredAt: Date,
  ): Promise<void>;
  recordTaxAuthorityAnswer(
    fiscalDocumentId: string,
    answer: RealTimeAuthorizationAnswer,
    answeredAt: Date,
  ): Promise<void>;
}

export interface PointOfSaleLanes {
  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: PointOfSaleLane) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface WsaaTokenSource {
  validToken(): Promise<WsaaToken | null>;
}

export interface FiscalDocumentSolicitation extends FiscalDocumentData {
  token: WsaaToken;
}

export type SolicitationAnswer =
  | { kind: "authorized"; authorizationCode: string; authorizationCodeDueOn: string }
  | { kind: "rejected"; codes: readonly number[] }
  | { kind: "no_answer" };

export interface TaxAuthorityInvoicing {
  solicit(solicitation: FiscalDocumentSolicitation): Promise<SolicitationAnswer>;
}

export interface AuthorizeFiscalDocumentPorts {
  lanes: PointOfSaleLanes;
  clock: Clock;
  tokens: WsaaTokenSource;
  taxAuthority: TaxAuthorityInvoicing;
}
