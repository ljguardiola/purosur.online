import type { Clock } from "../../shared/index.js";
import type { ShortCodeRandomness } from "./deferred-sale-ports.js";
import type { RealTimeAuthorizationResolved } from "./real-time-authorization-ports.js";
import type { IdGenerator } from "./sale-authorization-ports.js";

export interface InterruptedRealTimeAuthorization {
  fiscalDocumentId: string;
  saleId: string;
  reservedAt: Date;
  total: number;
}

export interface InterruptedRealTimeAuthorizations {
  transaction<TOutcome>(
    work: (tx: InterruptedRealTimeAuthorizationsTransaction) => TOutcome,
  ): TOutcome;
}

export interface InterruptedRealTimeAuthorizationsTransaction {
  requestingDocuments(): readonly InterruptedRealTimeAuthorization[];
  resolve(resolved: RealTimeAuthorizationResolved): void;
}

export interface InterruptedRealTimeAuthorizationPorts {
  documents: InterruptedRealTimeAuthorizations;
  clock: Clock;
  ids: IdGenerator;
  shortCodes: ShortCodeRandomness;
}
