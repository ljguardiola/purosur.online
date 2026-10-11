import type { Clock } from "../../shared/index.js";
import type { RealTimeAuthorizationResolved } from "./real-time-authorization-ports.js";

export interface InterruptedRealTimeAuthorization {
  fiscalDocumentId: string;
  saleId: string;
}

export interface InterruptedRealTimeAuthorizations {
  requestingDocuments(): Promise<readonly InterruptedRealTimeAuthorization[]>;
  resolve(resolved: RealTimeAuthorizationResolved): Promise<void>;
}

export interface InterruptedRealTimeAuthorizationPorts {
  documents: InterruptedRealTimeAuthorizations;
  clock: Clock;
}
