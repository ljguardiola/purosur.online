import type { Clock } from "./arca-certificate-expiry-store.js";

export interface WsaaToken {
  token: string;
  sign: string;
  issuedAt: Date;
  expiresAt: Date;
}

export type WsaaAuthenticationResult =
  | { kind: "issued"; token: WsaaToken }
  | { kind: "already_authenticated" }
  | { kind: "failed" };

export interface WsaaAuthentication {
  requestToken(service: string): Promise<WsaaAuthenticationResult>;
}

export interface WsaaTokenStoreTransaction {
  lockWsaaToken(service: string, certificateFingerprint: string): Promise<WsaaToken | null>;
  recordWsaaToken(
    service: string,
    certificateFingerprint: string,
    token: WsaaToken,
  ): Promise<void>;
}

export interface WsaaTokenStore {
  transaction<TOutcome>(
    work: (tx: WsaaTokenStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface WsaaTokenPorts {
  store: WsaaTokenStore;
  authentication: WsaaAuthentication;
  clock: Clock;
}
