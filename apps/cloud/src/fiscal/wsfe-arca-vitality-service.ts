import type { ArcaVitalityResult, ArcaVitalityService } from "@purosur/domain/fiscal/use-cases";
import type { Client } from "soap";
import { createWsfeClient } from "./wsfe-client.js";

const ARCA_VITALITY_TIMEOUT_MS = 10_000;

const WSFE_ENDPOINTS: Record<string, string> = {
  homologation: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  production: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
};

export function wsfeEndpointOf(environment: string): string {
  const endpoint = WSFE_ENDPOINTS[environment];
  if (endpoint === undefined) {
    throw new Error(`No WSFE endpoint for the ARCA environment "${environment}"`);
  }
  return endpoint;
}

export interface WsfeArcaVitalityServiceOptions {
  endpoint: string;
  timeoutMs?: number;
  onRawResponse?: (raw: string) => void;
}

function serverStatus(result: unknown, server: string): string | undefined {
  const dummy = (result as { FEDummyResult?: Record<string, unknown> } | undefined)?.FEDummyResult;
  const value = dummy?.[server];
  return typeof value === "string" ? value : undefined;
}

export class WsfeArcaVitalityService implements ArcaVitalityService {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly onRawResponse: ((raw: string) => void) | undefined;
  private client: Promise<Client> | undefined;

  constructor({
    endpoint,
    timeoutMs = ARCA_VITALITY_TIMEOUT_MS,
    onRawResponse,
  }: WsfeArcaVitalityServiceOptions) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.onRawResponse = onRawResponse;
  }

  async check(): Promise<ArcaVitalityResult> {
    try {
      this.client ??= createWsfeClient(this.endpoint);
      const client = await this.client;
      let result: unknown;
      try {
        [result] = await client["FEDummyAsync"]({}, { timeout: this.timeoutMs });
      } finally {
        if (typeof client.lastResponse === "string") {
          this.onRawResponse?.(client.lastResponse);
        }
      }
      const appServer = serverStatus(result, "AppServer");
      const dbServer = serverStatus(result, "DbServer");
      const authServer = serverStatus(result, "AuthServer");
      if (appServer === undefined || dbServer === undefined || authServer === undefined) {
        return { kind: "unreachable" };
      }
      return { kind: "answered", appServer, dbServer, authServer };
    } catch {
      return { kind: "unreachable" };
    }
  }
}
