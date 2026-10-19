import type { Clock } from "../../shared/index.js";
import type { TaxAuthorityRejection } from "../model/fiscal-rejection-standing.js";
import type { Fortnight } from "../model/offline-authorization-code.js";
import type { WithOwedPresentations } from "../model/owed-presentation-list.js";
import type { WsaaTokenSource } from "./fiscal-document-authorization-ports.js";
import type { OwedPresentationList } from "./owed-presentation-list-ports.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

export interface OfflineAuthorizationCode {
  code: string;
  fortnight: Fortnight;
  reportDeadline: string;
}

export type OfflineAuthorizationCodeOrigin = "requested" | "recovered";

export interface KeptOfflineAuthorizationCode {
  code: OfflineAuthorizationCode;
  obtainedAt: Date;
  obtainedThrough: OfflineAuthorizationCodeOrigin;
}

export type OfflineAuthorizationCodeRequestAnswer = WithOwedPresentations<
  | { kind: "granted"; code: OfflineAuthorizationCode }
  | { kind: "already_granted" }
  | { kind: "refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "no_answer" }
>;

export type OfflineAuthorizationCodeLookupAnswer = WithOwedPresentations<
  | { kind: "granted"; code: OfflineAuthorizationCode }
  | { kind: "not_granted" }
  | { kind: "refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "no_answer" }
>;

export interface OfflineAuthorizationCodeCall {
  token: WsaaToken;
  fortnight: Fortnight;
}

export interface TaxAuthorityOfflineAuthorizationCodes {
  request(call: OfflineAuthorizationCodeCall): Promise<OfflineAuthorizationCodeRequestAnswer>;
  lookUp(call: OfflineAuthorizationCodeCall): Promise<OfflineAuthorizationCodeLookupAnswer>;
}

export interface OfflineAuthorizationCodeAcquisition {
  isHeld(): Promise<boolean>;
  keep(kept: KeptOfflineAuthorizationCode): Promise<void>;
}

export interface OfflineAuthorizationCodeStore {
  hasOfflinePointOfSale(): Promise<boolean>;
  offlinePointsOfSale(): Promise<number[]>;
  holdAcquisition<TOutcome>(
    fortnight: Fortnight,
    work: (acquisition: OfflineAuthorizationCodeAcquisition) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface OfflineAuthorizationCodePorts {
  store: OfflineAuthorizationCodeStore;
  tokens: WsaaTokenSource;
  taxAuthority: TaxAuthorityOfflineAuthorizationCodes;
  owedPresentations: OwedPresentationList;
  clock: Clock;
}
