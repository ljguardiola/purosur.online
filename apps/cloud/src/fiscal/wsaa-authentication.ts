import { fileURLToPath } from "node:url";
import {
  localClock,
  offsetAt,
  utcOffsetText,
  type ZoneRules,
  type ZoneRulesSource,
} from "@purosur/domain";
import type {
  WsaaAuthentication,
  WsaaAuthenticationResult,
} from "@purosur/domain/fiscal/use-cases";
import forge from "node-forge";
import type { Client } from "soap";
import { createArcaSoapClient } from "./arca-soap-client.js";

// `wsdl/` sits beside both `src/` and `dist/` and ships through package.json's `files`.
const WSAA_WSDL_PATH = fileURLToPath(new URL("../../wsdl/wsaa.wsdl", import.meta.url));

const WSAA_TIMEOUT_MS = 30_000;

// ARCA rejects a ticket request whose generation time is ahead of its own clock, so it is stamped
// in the past; the expiration only bounds how long ARCA accepts this one request.
const TICKET_REQUEST_GENERATION_SKEW_MS = 5 * 60 * 1000;
const TICKET_REQUEST_VALIDITY_MS = 5 * 60 * 1000;

const ALREADY_AUTHENTICATED_FAULT_CODE = "coe.alreadyAuthenticated";

const WSAA_ENDPOINTS: Record<string, string> = {
  homologation: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  production: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
};

export function wsaaEndpointOf(environment: string): string {
  const endpoint = WSAA_ENDPOINTS[environment];
  if (endpoint === undefined) {
    throw new Error(`No WSAA endpoint for the ARCA environment "${environment}"`);
  }
  return endpoint;
}

/** ARCA reads a ticket's times as the store's local time, so the offset is always written out. */
function argentinaTimestamp(instant: Date, rules: ZoneRules): string {
  const clock = localClock(instant, rules).toISOString().slice(0, 19);
  return `${clock}${utcOffsetText(offsetAt(rules, instant))}`;
}

function loginTicketRequestOf(service: string, now: Date, rules: ZoneRules): string {
  const generation = new Date(now.getTime() - TICKET_REQUEST_GENERATION_SKEW_MS);
  const expiration = new Date(now.getTime() + TICKET_REQUEST_VALIDITY_MS);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0"><header>' +
    `<uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId>` +
    `<generationTime>${argentinaTimestamp(generation, rules)}</generationTime>` +
    `<expirationTime>${argentinaTimestamp(expiration, rules)}</expirationTime>` +
    `</header><service>${service}</service></loginTicketRequest>`
  );
}

function signedCms(content: string, certificatePem: string, privateKeyPem: string): string {
  const certificate = forge.pki.certificateFromPem(certificatePem);
  const signedData = forge.pkcs7.createSignedData();
  signedData.content = forge.util.createBuffer(content, "utf8");
  signedData.addCertificate(certificate);
  signedData.addSigner({
    key: forge.pki.privateKeyFromPem(privateKeyPem),
    certificate,
    digestAlgorithm: forge.pki.oids["sha256"] as string,
    authenticatedAttributes: [
      { type: forge.pki.oids["contentType"] as string, value: forge.pki.oids["data"] as string },
      { type: forge.pki.oids["messageDigest"] as string },
    ],
  });
  signedData.sign();
  return forge.util.encode64(forge.asn1.toDer(signedData.toAsn1()).getBytes());
}

function elementText(xml: string, element: string): string | undefined {
  return new RegExp(`<${element}>([^<]*)</${element}>`).exec(xml)?.[1]?.trim();
}

function issuedTokenOf(loginTicketResponse: unknown): WsaaAuthenticationResult {
  if (typeof loginTicketResponse !== "string") {
    return { kind: "failed" };
  }
  const token = elementText(loginTicketResponse, "token");
  const sign = elementText(loginTicketResponse, "sign");
  const issuedAt = new Date(elementText(loginTicketResponse, "generationTime") ?? Number.NaN);
  const expiresAt = new Date(elementText(loginTicketResponse, "expirationTime") ?? Number.NaN);
  if (!token || !sign || Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    return { kind: "failed" };
  }
  return { kind: "issued", token: { token, sign, issuedAt, expiresAt } };
}

function isAlreadyAuthenticatedFault(error: unknown): boolean {
  const fault = (error as { root?: { Envelope?: { Body?: { Fault?: { faultcode?: unknown } } } } })
    .root?.Envelope?.Body?.Fault;
  return JSON.stringify(fault?.faultcode ?? "").includes(ALREADY_AUTHENTICATED_FAULT_CODE);
}

export interface ArcaWsaaAuthenticationOptions {
  endpoint: string;
  certificatePem: string;
  privateKeyPem: string;
  now: () => Date;
  zoneRules: ZoneRulesSource;
  timeoutMs?: number;
  onRawResponse?: (raw: string) => void;
}

export class ArcaWsaaAuthentication implements WsaaAuthentication {
  private readonly endpoint: string;
  private readonly certificatePem: string;
  private readonly privateKeyPem: string;
  private readonly now: () => Date;
  private readonly zoneRules: ZoneRulesSource;
  private readonly timeoutMs: number;
  private readonly onRawResponse: ((raw: string) => void) | undefined;
  private client: Promise<Client> | undefined;

  constructor({
    endpoint,
    certificatePem,
    privateKeyPem,
    now,
    zoneRules,
    timeoutMs = WSAA_TIMEOUT_MS,
    onRawResponse,
  }: ArcaWsaaAuthenticationOptions) {
    this.endpoint = endpoint;
    this.certificatePem = certificatePem;
    this.privateKeyPem = privateKeyPem;
    this.now = now;
    this.zoneRules = zoneRules;
    this.timeoutMs = timeoutMs;
    this.onRawResponse = onRawResponse;
  }

  async requestToken(service: string): Promise<WsaaAuthenticationResult> {
    try {
      const cms = signedCms(
        loginTicketRequestOf(service, this.now(), this.zoneRules.zoneRules()),
        this.certificatePem,
        this.privateKeyPem,
      );
      this.client ??= createArcaSoapClient(WSAA_WSDL_PATH, this.endpoint);
      const client = await this.client;
      let result: unknown;
      try {
        [result] = await client["loginCmsAsync"]({ in0: cms }, { timeout: this.timeoutMs });
      } finally {
        if (typeof client.lastResponse === "string") {
          this.onRawResponse?.(client.lastResponse);
        }
      }
      return issuedTokenOf((result as { loginCmsReturn?: unknown } | undefined)?.loginCmsReturn);
    } catch (error) {
      return isAlreadyAuthenticatedFault(error)
        ? { kind: "already_authenticated" }
        : { kind: "failed" };
    }
  }
}
