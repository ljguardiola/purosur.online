import { fileURLToPath } from "node:url";
import type { ArcaVitalityResult, ArcaVitalityService } from "@purosur/domain/fiscal/use-cases";
import { type Client, createClientAsync } from "soap";

// `wsdl/` sits beside both `src/` and `dist/` and ships through package.json's `files`.
const WSFE_WSDL_PATH = fileURLToPath(new URL("../../wsdl/wsfev1.wsdl", import.meta.url));

const ARCA_VITALITY_TIMEOUT_MS = 10_000;

const WSFE_ENDPOINTS: Record<string, string> = {
  homologation: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  production: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
};

export function wsfeEndpointOf(environment: string): string {
  const endpoint = WSFE_ENDPOINTS[environment];
  if (endpoint === undefined) {
    throw new Error(`No WSFE endpoint for the ARCA environment ""`);
  }
  return endpoint;
}

export interface WsfeArcaVitalityServiceOptions {
  endpoint: string;
  timeoutMs?: number;
}

function serverStatus(result: unknown, server: string): string | undefined {
  const dummy = (result as { FEDummyResult?: Record<string, unknown> } | undefined)?.FEDummyResult;
  const value = dummy?.[server];
  return typeof value === "string" ? value : undefined;
}

export class WsfeArcaVitalityService implements ArcaVitalityService {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private client: Promise<Client> | undefined;

  constructor({ endpoint, timeoutMs = ARCA_VITALITY_TIMEOUT_MS }: WsfeArcaVitalityServiceOptions) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }

  async check(): Promise<ArcaVitalityResult> {
    try {
      this.client ??= createClientAsync(WSFE_WSDL_PATH, { endpoint: this.endpoint });
      const client = await this.client;
      const [result] = await client["FEDummyAsync"]({}, { timeout: this.timeoutMs });
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
