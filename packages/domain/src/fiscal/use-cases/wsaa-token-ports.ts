import type { Clock } from "../../shared/index.js";

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

export interface WsaaTokenRenewal {
  persistedToken(): Promise<WsaaToken | null>;
  recordIssuedToken(token: WsaaToken): Promise<void>;
}

export interface WsaaTokenStore {
  holdRenewal<TOutcome>(
    service: string,
    certificateFingerprint: string,
    work: (renewal: WsaaTokenRenewal) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface WsaaTokenPorts {
  store: WsaaTokenStore;
  authentication: WsaaAuthentication;
  clock: Clock;
}
