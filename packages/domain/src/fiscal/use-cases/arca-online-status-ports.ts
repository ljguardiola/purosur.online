import type { ArcaReachabilityEvidence } from "../model/arca-reachability.js";
import type { Clock } from "./arca-certificate-expiry-store.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

export interface ArcaReachabilityReader {
  reachabilityEvidence(): Promise<ArcaReachabilityEvidence>;
}

export interface WsaaTokenReader {
  currentWsaaToken(service: string, certificateFingerprint: string): Promise<WsaaToken | null>;
}

export interface ArcaOnlineStatusPorts {
  reachability: ArcaReachabilityReader;
  tokens: WsaaTokenReader;
  clock: Clock;
}
