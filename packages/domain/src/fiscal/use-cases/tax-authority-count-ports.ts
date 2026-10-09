import type { Clock } from "../../shared/index.js";
import type { WsaaTokenSource } from "./fiscal-document-authorization-ports.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

export type LastAuthorizedAnswer = { kind: "read"; number: number } | { kind: "no_answer" };

export interface TaxAuthorityLastAuthorizedLookup {
  lastAuthorized(lookup: { token: WsaaToken; pointOfSale: number }): Promise<LastAuthorizedAnswer>;
}

export interface LastAuthorizedCount {
  pointOfSale: number;
  lastAuthorized: number;
  readAt: Date;
}

export interface TaxAuthorityCounts {
  record(count: LastAuthorizedCount): Promise<void>;
}

export interface TaxAuthorityCountPorts {
  tokens: WsaaTokenSource;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
  counts: TaxAuthorityCounts;
  clock: Clock;
}
