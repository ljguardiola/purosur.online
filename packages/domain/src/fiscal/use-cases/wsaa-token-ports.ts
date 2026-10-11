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

export interface WsaaTokenAnswer {
  recordIssuedToken(token: WsaaToken): Promise<void>;
  clearRefusal(): Promise<void>;
  resolveHeldTicketAlert(resolvedAt: Date): Promise<void>;
  resumeWorkWaitingOnToken(): Promise<void>;
  recordRefusal(refusedAt: Date): Promise<void>;
  openHeldTicketAlert(openedAt: Date): Promise<void>;
}

export interface WsaaTokenRenewal {
  persistedToken(): Promise<WsaaToken | null>;
  lastRefusal(): Promise<Date | null>;
  recordAnswer<TOutcome>(work: (answer: WsaaTokenAnswer) => Promise<TOutcome>): Promise<TOutcome>;
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
