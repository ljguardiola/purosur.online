import type { Clock } from "../../shared/index.js";
import type { WsaaTokenSource } from "./fiscal-document-authorization-ports.js";
import type { TaxAuthorityVoucherLookup } from "./unclear-outcome-ports.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

export type LastAuthorizedAnswer = { kind: "read"; number: number } | { kind: "no_answer" };

export interface TaxAuthorityLastAuthorizedLookup {
  lastAuthorized(lookup: {
    token: WsaaToken;
    pointOfSale: number;
    voucherType: number;
  }): Promise<LastAuthorizedAnswer>;
}

export interface LastAuthorizedCount {
  pointOfSale: number;
  lastAuthorized: number;
  issuedOn?: string | null;
  readAt: Date;
}

export interface TaxAuthorityCounts {
  advance(count: LastAuthorizedCount): Promise<void>;
}

export interface TaxAuthorityCountPorts {
  tokens: WsaaTokenSource;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
  vouchers: TaxAuthorityVoucherLookup;
  counts: TaxAuthorityCounts;
  clock: Clock;
}
