import type { ArcaReachabilityEvidence } from "../../model/arca-reachability.js";
import type { ArcaReachabilityReader, WsaaTokenReader } from "../arca-online-status-ports.js";
import type { WsaaToken } from "../wsaa-token-ports.js";

export class FakeArcaReachabilityReader implements ArcaReachabilityReader {
  evidence: ArcaReachabilityEvidence = { lastVitalityCheckOkAt: null, lastWsfeCallOkAt: null };

  async reachabilityEvidence(): Promise<ArcaReachabilityEvidence> {
    return this.evidence;
  }
}

export class FakeWsaaTokenReader implements WsaaTokenReader {
  readonly reads: Array<{ service: string; certificateFingerprint: string }> = [];
  private readonly tokens: Array<{
    service: string;
    certificateFingerprint: string;
    token: WsaaToken;
  }> = [];

  seed(service: string, certificateFingerprint: string, token: WsaaToken): void {
    this.tokens.push({ service, certificateFingerprint, token });
  }

  async currentWsaaToken(
    service: string,
    certificateFingerprint: string,
  ): Promise<WsaaToken | null> {
    this.reads.push({ service, certificateFingerprint });
    return (
      this.tokens.find(
        (candidate) =>
          candidate.service === service &&
          candidate.certificateFingerprint === certificateFingerprint,
      )?.token ?? null
    );
  }
}
