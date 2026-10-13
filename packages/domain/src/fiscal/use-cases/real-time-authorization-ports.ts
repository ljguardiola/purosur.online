import type { Clock } from "../../shared/index.js";
import type { PushedEvent } from "../../sync/index.js";
import type { DeferredSale } from "../model/deferred-sale.js";
import type { FacturaC } from "../model/pre-emission-gate.js";
import type {
  RealTimeAuthorizationAnswer,
  RealTimeAuthorizationResolution,
} from "../model/real-time-authorization.js";
import type { ShortCodeRandomness } from "./deferred-sale-ports.js";
import type { IdGenerator } from "./sale-authorization-ports.js";

export interface WaitingFiscalDocument {
  fiscalDocumentId: string;
  saleId: string;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  document: FacturaC;
  reservedAt: Date;
  saleEvent: PushedEvent | null;
}

export interface RealTimeAuthorizationResolved {
  fiscalDocumentId: string;
  saleId: string;
  resolution: RealTimeAuthorizationResolution;
  resolvedAt: Date;
  deferredSale: DeferredSale | null;
}

export interface RealTimeFiscalDocuments {
  waitingDocumentOfSale(saleId: string): Promise<WaitingFiscalDocument | null>;
  resolve(resolved: RealTimeAuthorizationResolved): Promise<void>;
}

export interface RoundTripSamples {
  recent(): Promise<readonly number[]>;
}

export interface RealTimeAuthorizationCall extends Omit<WaitingFiscalDocument, "saleEvent"> {
  saleEvent: PushedEvent;
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
  ids: IdGenerator;
  shortCodes: ShortCodeRandomness;
}
