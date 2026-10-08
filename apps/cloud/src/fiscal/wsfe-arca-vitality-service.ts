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
  onUnreachable?: (cause: string) => void;
}

export type WsfeArcaVitalityResult =
  | Exclude<ArcaVitalityResult, { kind: "unreachable" }>
  | { kind: "unreachable"; cause: string };

const SERVERS = ["AppServer", "DbServer", "AuthServer"] as const;

function serverStatus(result: unknown, server: string): string | undefined {
  const dummy = (result as { FEDummyResult?: Record<string, unknown> } | undefined)?.FEDummyResult;
  const value = dummy?.[server];
  return typeof value === "string" ? value : undefined;
}

interface SoapClientFailure {
  message?: unknown;
  code?: unknown;
  response?: { status?: unknown };
  Fault?: { faultstring?: unknown };
}

function causeOf(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }
  const failure = error as SoapClientFailure;
  const message =
    typeof failure.message === "string"
      ? failure.message
      : typeof failure.Fault?.faultstring === "string"
        ? failure.Fault.faultstring
        : String(error);
  const firstLine = message.split("\n", 1)[0]?.trim() ?? "";
  if (typeof failure.response?.status === "number") {
    return `HTTP ${failure.response.status}: ${firstLine}`;
  }
  if (typeof failure.code === "string" && !firstLine.includes(failure.code)) {
    return `${failure.code}: ${firstLine}`;
  }
  return firstLine;
}

export class WsfeArcaVitalityService implements ArcaVitalityService {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly onRawResponse: ((raw: string) => void) | undefined;
  private readonly onUnreachable: ((cause: string) => void) | undefined;
  private client: Promise<Client> | undefined;

  constructor({
    endpoint,
    timeoutMs = ARCA_VITALITY_TIMEOUT_MS,
    onRawResponse,
    onUnreachable,
  }: WsfeArcaVitalityServiceOptions) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.onRawResponse = onRawResponse;
    this.onUnreachable = onUnreachable;
  }

  async check(): Promise<WsfeArcaVitalityResult> {
    const result = await this.call();
    if (result.kind === "unreachable") {
      this.onUnreachable?.(result.cause);
    }
    return result;
  }

  private async call(): Promise<WsfeArcaVitalityResult> {
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
        const lacking = SERVERS.filter((server) => serverStatus(result, server) === undefined);
        return { kind: "unreachable", cause: `the answer lacked ${lacking.join(", ")}` };
      }
      return { kind: "answered", appServer, dbServer, authServer };
    } catch (error) {
      return { kind: "unreachable", cause: causeOf(error) };
    }
  }
}
