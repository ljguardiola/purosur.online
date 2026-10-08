import {
  type ArcaVitalityResult,
  checkArcaVitality,
  type WsaaAuthenticationResult,
} from "@purosur/domain/fiscal/use-cases";
import { arcaCredentialsOf } from "./arca-credentials.js";
import { ArcaWsaaAuthentication } from "./wsaa-authentication.js";
import { WsfeArcaVitalityService } from "./wsfe-arca-vitality-service.js";

const WSAA_SERVICE = "wsfe";

interface ArcaTestEnvironmentCheckSettings {
  certificatePem: string;
  privateKeyPem: string;
}

export type ArcaTestEnvironmentCheckSettingsResult =
  | { kind: "ready"; settings: ArcaTestEnvironmentCheckSettings }
  | { kind: "refused"; reason: string };

export function arcaTestEnvironmentCheckSettingsOf(
  argv: string[],
  env: Record<string, string | undefined>,
): ArcaTestEnvironmentCheckSettingsResult {
  if (argv.length > 0) {
    return { kind: "refused", reason: "accepts no argument" };
  }
  const credentials = arcaCredentialsOf(env);
  if (credentials.kind === "refused") {
    return credentials;
  }
  const { certificatePem, privateKeyPem } = credentials;
  return { kind: "ready", settings: { certificatePem, privateKeyPem } };
}

export interface CheckArcaTestEnvironmentOptions extends ArcaTestEnvironmentCheckSettings {
  wsaaEndpoint: string;
  wsfeEndpoint: string;
  now: () => Date;
  timeoutMs?: number;
}

type FeDummyCheck = { kind: "ok" } | { kind: "not_ok"; answer: ArcaVitalityResult };

type LoginCheck =
  | { kind: "issued" }
  | { kind: "already_authenticated" }
  | { kind: "failed"; fault: string | undefined };

export interface ArcaTestEnvironmentCheckReport {
  passed: boolean;
  feDummy: FeDummyCheck;
  login: LoginCheck;
}

function elementText(xml: string, element: string): string | undefined {
  return new RegExp(`<${element}(?:\\s[^>]*)?>([^<]*)</${element}>`).exec(xml)?.[1]?.trim();
}

function soapFaultOf(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const code = elementText(raw, "faultcode");
  const description = elementText(raw, "faultstring");
  if (code === undefined) {
    return undefined;
  }
  return description === undefined ? code : `${code}: ${description}`;
}

async function checkFeDummy(options: CheckArcaTestEnvironmentOptions): Promise<FeDummyCheck> {
  const service = new WsfeArcaVitalityService({
    endpoint: options.wsfeEndpoint,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  let answer: ArcaVitalityResult = { kind: "unreachable" };
  const outcome = await checkArcaVitality({
    vitality: {
      check: async () => {
        answer = await service.check();
        return answer;
      },
    },
    store: { recordVitalityCheck: async () => {} },
    clock: { now: options.now },
  });
  return outcome.kind === "ok" ? { kind: "ok" } : { kind: "not_ok", answer };
}

async function checkLogin(options: CheckArcaTestEnvironmentOptions): Promise<LoginCheck> {
  let raw: string | undefined;
  const result: WsaaAuthenticationResult = await new ArcaWsaaAuthentication({
    endpoint: options.wsaaEndpoint,
    certificatePem: options.certificatePem,
    privateKeyPem: options.privateKeyPem,
    now: options.now,
    onRawResponse: (response) => {
      raw = response;
    },
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  }).requestToken(WSAA_SERVICE);
  switch (result.kind) {
    case "issued":
      return { kind: "issued" };
    case "already_authenticated":
      return { kind: "already_authenticated" };
    case "failed":
      return { kind: "failed", fault: soapFaultOf(raw) };
  }
}

export async function checkArcaTestEnvironment(
  options: CheckArcaTestEnvironmentOptions,
): Promise<ArcaTestEnvironmentCheckReport> {
  const feDummy = await checkFeDummy(options);
  const login = await checkLogin(options);
  return { passed: feDummy.kind === "ok" && login.kind !== "failed", feDummy, login };
}

function describeFeDummy(feDummy: FeDummyCheck): string {
  if (feDummy.kind === "ok") {
    return "FEDummy: every server answered OK";
  }
  const { answer } = feDummy;
  if (answer.kind === "unreachable") {
    return "FEDummy: no answer the client could read";
  }
  return `FEDummy: AppServer ${answer.appServer}, DbServer ${answer.dbServer}, AuthServer ${answer.authServer}`;
}

function describeLogin(login: LoginCheck): string {
  switch (login.kind) {
    case "issued":
      return "loginCms: issued a ticket";
    case "already_authenticated":
      return "loginCms: refused because a ticket for this certificate is still valid";
    case "failed":
      return `loginCms: failed with ${login.fault ?? "no SOAP fault the client could read"}`;
  }
}

export function describeArcaTestEnvironmentCheck(report: ArcaTestEnvironmentCheckReport): string[] {
  return [describeFeDummy(report.feDummy), describeLogin(report.login)];
}
