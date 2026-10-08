import type { Clock } from "../../shared/index.js";
import type { PushedEvent } from "../../sync/index.js";
import type { FacturaC } from "../model/pre-emission-gate.js";
import type {
  RealTimeAuthorizationAnswer,
  RealTimeAuthorizationResolution,
} from "../model/real-time-authorization.js";

export interface WaitingFiscalDocument {
  fiscalDocumentId: string;
  saleId: string;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  document: FacturaC;
  saleEvent: PushedEvent;
}

export interface RealTimeAuthorizationResolved {
  fiscalDocumentId: string;
  saleId: string;
  resolution: RealTimeAuthorizationResolution;
  resolvedAt: Date;
}

export interface RealTimeFiscalDocuments {
  waitingDocument(fiscalDocumentId: string): Promise<WaitingFiscalDocument | null>;
  resolve(resolved: RealTimeAuthorizationResolved): Promise<void>;
}

export interface RoundTripSamples {
  recent(): Promise<readonly number[]>;
}

export interface RealTimeAuthorizationCall extends WaitingFiscalDocument {
  timeoutMs: number;
  roundTripMedianMs: number;
}

export interface RealTimeTaxAuthority {
  authorize(call: RealTimeAuthorizationCall): Promise<RealTimeAuthorizationAnswer>;
}

export interface RealTimeAuthorizationPorts {
  documents: RealTimeFiscalDocuments;
  roundTrips: RoundTripSamples;
  taxAuthority: RealTimeTaxAuthority;
  clock: Clock;
}
