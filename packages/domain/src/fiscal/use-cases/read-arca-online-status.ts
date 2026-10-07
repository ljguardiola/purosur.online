import { isArcaReachable } from "../model/arca-reachability.js";
import { isWsaaTokenValid } from "../model/wsaa-token.js";
import type { ArcaOnlineStatusPorts } from "./arca-online-status-ports.js";

export interface ReadArcaOnlineStatusInput {
  service: string;
  certificateFingerprint: string;
}

export interface ArcaOnlineStatus {
  tokenValid: boolean;
  probeOkAt: Date | null;
  reachable: boolean;
}

export async function readArcaOnlineStatus(
  { reachability, tokens, clock }: ArcaOnlineStatusPorts,
  { service, certificateFingerprint }: ReadArcaOnlineStatusInput,
): Promise<ArcaOnlineStatus> {
  const [evidence, token] = await Promise.all([
    reachability.reachabilityEvidence(),
    tokens.currentWsaaToken(service, certificateFingerprint),
  ]);
  const now = clock.now();
  return {
    tokenValid: token !== null && isWsaaTokenValid(token, now),
    probeOkAt: evidence.lastVitalityCheckOkAt,
    reachable: isArcaReachable(evidence, now),
  };
}
