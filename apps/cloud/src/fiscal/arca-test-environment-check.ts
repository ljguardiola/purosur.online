import { checkArcaVitality, type WsaaAuthenticationResult } from "@purosur/domain/fiscal/use-cases";
import { arcaCredentialsOf } from "./arca-credentials.js";
import { ArcaWsaaAuthentication } from "./wsaa-authentication.js";
import {
  type WsfeArcaVitalityResult,
  WsfeArcaVitalityService,
} from "./wsfe-arca-vitality-service.js";

const WSAA_SERVICE = "wsfe";
const FE_DUMMY_ATTEMPTS = 2;

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

type FeDummyAttempt = { kind: "ok" } | { kind: "not_ok"; answer: WsfeArcaVitalityResult };

type LoginCheck =
  | { kind: "issued" }
  | { kind: "already_authenticated" }
  | { kind: "failed"; fault: string | undefined };

export interface ArcaTestEnvironmentCheckReport {
  passed: boolean;
  feDummy: FeDummyAttempt[];
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

async function attemptFeDummy(
  service: WsfeArcaVitalityService,
  now: () => Date,
): Promise<FeDummyAttempt> {
  const answer = await service.check();
  const outcome = await checkArcaVitality({
    vitality: { check: async () => answer },
    store: { recordVitalityCheck: async () => {} },
    clock: { now },
  });
  return outcome.kind === "ok" ? { kind: "ok" } : { kind: "not_ok", answer };
}

async function checkFeDummy(options: CheckArcaTestEnvironmentOptions): Promise<FeDummyAttempt[]> {
  const service = new WsfeArcaVitalityService({
    endpoint: options.wsfeEndpoint,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  const attempts: FeDummyAttempt[] = [];
  let attempt: FeDummyAttempt;
  do {
    attempt = await attemptFeDummy(service, options.now);
    attempts.push(attempt);
  } while (
    attempt.kind === "not_ok" &&
    attempt.answer.kind === "unreachable" &&
    attempts.length < FE_DUMMY_ATTEMPTS
  );
  return attempts;
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
  const passed = feDummy.at(-1)?.kind === "ok" && login.kind !== "failed";
  return { passed, feDummy, login };
}

function describeFeDummyAttempt(attempt: FeDummyAttempt): string {
  if (attempt.kind === "ok") {
    return "every server answered OK";
  }
  const { answer } = attempt;
  if (answer.kind === "unreachable") {
    return `no answer the client could read (${answer.cause})`;
  }
  return `AppServer ${answer.appServer}, DbServer ${answer.dbServer}, AuthServer ${answer.authServer}`;
}

function describeFeDummy(feDummy: FeDummyAttempt[]): string[] {
  if (feDummy.length === 1) {
    return feDummy.map((attempt) => `FEDummy: ${describeFeDummyAttempt(attempt)}`);
  }
  return feDummy.map(
    (attempt, index) => `FEDummy attempt ${index + 1}: ${describeFeDummyAttempt(attempt)}`,
  );
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
  return [...describeFeDummy(report.feDummy), describeLogin(report.login)];
}

export async function runArcaTestEnvironmentCheck(
  options: CheckArcaTestEnvironmentOptions,
  write: (line: string) => void,
): Promise<number> {
  const report = await checkArcaTestEnvironment(options);
  for (const line of describeArcaTestEnvironmentCheck(report)) {
    write(line);
  }
  return report.passed ? 0 : 1;
}
