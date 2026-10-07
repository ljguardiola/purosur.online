import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizePemNewlines } from "../platform/pem-newlines.js";
import { type ScrubReplacement, scrubArcaRecording } from "./scrub-arca-recording.js";
import { ArcaWsaaAuthentication } from "./wsaa-authentication.js";
import { WsfeArcaVitalityService } from "./wsfe-arca-vitality-service.js";

const WSAA_SERVICE = "wsfe";

export type RecordingSettingsResult =
  | {
      kind: "ready";
      settings: Pick<RecordArcaResponsesOptions, "outDir" | "certificatePem" | "privateKeyPem">;
    }
  | { kind: "refused"; reason: string };

export function recordingSettingsOf(
  argv: string[],
  env: Record<string, string | undefined>,
): RecordingSettingsResult {
  const [flag, outDir, ...rest] = argv;
  if (flag !== "--out" || !outDir) {
    return { kind: "refused", reason: "usage: record-arca-responses --out <directory>" };
  }
  if (rest.length > 0) {
    return { kind: "refused", reason: "only --out <directory> is accepted" };
  }
  const certificate = env["ARCA_CERTIFICATE"];
  const privateKey = env["ARCA_PRIVATE_KEY"];
  if (!certificate) {
    return { kind: "refused", reason: "ARCA_CERTIFICATE is not set" };
  }
  if (!privateKey) {
    return { kind: "refused", reason: "ARCA_PRIVATE_KEY is not set" };
  }
  return {
    kind: "ready",
    settings: {
      outDir,
      certificatePem: normalizePemNewlines(certificate),
      privateKeyPem: normalizePemNewlines(privateKey),
    },
  };
}

export interface RecordArcaResponsesOptions {
  outDir: string;
  certificatePem: string;
  privateKeyPem: string;
  wsaaEndpoint: string;
  wsfeEndpoint: string;
  now: () => Date;
  timeoutMs?: number;
}

export interface ArcaRecordingReport {
  firstLoginIssuedTicket: boolean;
  scrubbed: { file: string; replacements: ScrubReplacement[] }[];
}

function capturedBy(call: string): { onRawResponse: (raw: string) => void; raw: () => string } {
  let captured: string | undefined;
  return {
    onRawResponse: (raw) => {
      captured = raw;
    },
    raw: () => {
      if (captured === undefined) {
        throw new Error(`ARCA gave no answer to ${call}, so there is nothing to record`);
      }
      return captured;
    },
  };
}

export async function recordArcaResponses(
  options: RecordArcaResponsesOptions,
): Promise<ArcaRecordingReport> {
  const { timeoutMs } = options;
  const timeout = timeoutMs === undefined ? {} : { timeoutMs };

  const dummy = capturedBy("FEDummy");
  await new WsfeArcaVitalityService({
    endpoint: options.wsfeEndpoint,
    onRawResponse: dummy.onRawResponse,
    ...timeout,
  }).check();
  const feDummy = dummy.raw();

  let logins = 0;
  const firstLogin = capturedBy("the first loginCms");
  const secondLogin = capturedBy("the second loginCms");
  let current = firstLogin;
  const authentication = new ArcaWsaaAuthentication({
    endpoint: options.wsaaEndpoint,
    certificatePem: options.certificatePem,
    privateKeyPem: options.privateKeyPem,
    now: () => new Date(options.now().getTime() + logins * 1000),
    onRawResponse: (raw) => current.onRawResponse(raw),
    ...timeout,
  });
  const first = await authentication.requestToken(WSAA_SERVICE);
  const issued = firstLogin.raw();
  logins += 1;
  current = secondLogin;
  await authentication.requestToken(WSAA_SERVICE);
  const alreadyAuthenticated = secondLogin.raw();

  await mkdir(options.outDir, { recursive: true });
  const scrubbed: ArcaRecordingReport["scrubbed"] = [];
  const recordings = [
    ["fe-dummy", feDummy],
    ["login-cms-issued", issued],
    ["login-cms-already-authenticated", alreadyAuthenticated],
  ] as const;
  for (const [name, raw] of recordings) {
    const result = scrubArcaRecording(raw);
    const file = `${name}.scrubbed.xml`;
    await writeFile(join(options.outDir, `${name}.raw.xml`), raw);
    await writeFile(join(options.outDir, file), result.text);
    scrubbed.push({ file, replacements: result.replacements });
  }
  return { firstLoginIssuedTicket: first.kind === "issued", scrubbed };
}
