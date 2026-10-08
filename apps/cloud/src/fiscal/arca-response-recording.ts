import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isPointOfSaleNumber, selectConsumerBuyerTaxStatus } from "@purosur/domain";
import { requireAuthorizedCuit } from "../server.js";
import { arcaCredentialsOf } from "./arca-credentials.js";
import { type ScrubReplacement, scrubArcaRecording } from "./scrub-arca-recording.js";
import { ArcaWsaaAuthentication } from "./wsaa-authentication.js";
import { WsfeArcaVitalityService } from "./wsfe-arca-vitality-service.js";
import { WsfeBuyerTaxStatusSource } from "./wsfe-buyer-tax-status-source.js";
import { WsfeTaxAuthorityInvoicing } from "./wsfe-tax-authority-invoicing.js";
import { WsfeTaxAuthorityLastAuthorized } from "./wsfe-tax-authority-last-authorized.js";

const WSAA_SERVICE = "wsfe";
const UNISSUED_TOKEN = "FICTIONAL-TOKEN-0001";
const UNISSUED_SIGN = "FICTIONAL-SIGN-0001";
const INVOICE_TOTAL_CENTS = 10_000;
const INVALID_BUYER_TAX_STATUS_CODE = 99_999;
const USAGE = "usage: record-arca-responses --out <directory> --point-of-sale <number>";
const FLAGS = ["--out", "--point-of-sale"];

export type RecordingSettingsResult =
  | {
      kind: "ready";
      settings: Pick<
        RecordArcaResponsesOptions,
        "outDir" | "pointOfSale" | "certificatePem" | "privateKeyPem" | "cuit"
      >;
    }
  | { kind: "refused"; reason: string };

export function recordingSettingsOf(
  argv: string[],
  env: Record<string, string | undefined>,
): RecordingSettingsResult {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index] as string;
    const value = argv[index + 1];
    if (!FLAGS.includes(flag) || !value || values.has(flag)) {
      return { kind: "refused", reason: USAGE };
    }
    values.set(flag, value);
  }
  const outDir = values.get("--out");
  const pointOfSaleText = values.get("--point-of-sale");
  if (!outDir || pointOfSaleText === undefined) {
    return { kind: "refused", reason: USAGE };
  }
  const pointOfSale = Number(pointOfSaleText);
  if (!/^\d+$/.test(pointOfSaleText) || !isPointOfSaleNumber(pointOfSale)) {
    return { kind: "refused", reason: "--point-of-sale must be a point of sale number" };
  }
  const credentials = arcaCredentialsOf(env);
  if (credentials.kind === "refused") {
    return credentials;
  }
  let cuit: string;
  try {
    cuit = requireAuthorizedCuit(env);
  } catch (error) {
    return { kind: "refused", reason: error instanceof Error ? error.message : String(error) };
  }
  return {
    kind: "ready",
    settings: {
      outDir,
      pointOfSale,
      certificatePem: credentials.certificatePem,
      privateKeyPem: credentials.privateKeyPem,
      cuit,
    },
  };
}

export interface RecordArcaResponsesOptions {
  outDir: string;
  pointOfSale: number;
  certificatePem: string;
  privateKeyPem: string;
  wsaaEndpoint: string;
  wsfeEndpoint: string;
  cuit: string;
  now: () => Date;
  timeoutMs?: number;
}

export interface ArcaRecordingReport {
  firstLoginIssuedTicket: boolean;
  invoicesRecorded: boolean;
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
  const buyerTaxStatusRecordings: [string, string][] = [];
  const invoicingRecordings: [string, string][] = [];
  let invoicesRecorded = false;
  if (first.kind === "issued") {
    const withIssuedTicket = capturedBy("FEParamGetCondicionIvaReceptor");
    const buyerTaxStatusSet = await new WsfeBuyerTaxStatusSource({
      endpoint: options.wsfeEndpoint,
      cuit: options.cuit,
      onRawResponse: withIssuedTicket.onRawResponse,
      ...timeout,
    }).fetchBuyerTaxStatusSet(first.token);
    const withUnissuedTicket = capturedBy("FEParamGetCondicionIvaReceptor with an unissued ticket");
    await new WsfeBuyerTaxStatusSource({
      endpoint: options.wsfeEndpoint,
      cuit: options.cuit,
      onRawResponse: withUnissuedTicket.onRawResponse,
      ...timeout,
    }).fetchBuyerTaxStatusSet({ ...first.token, token: UNISSUED_TOKEN, sign: UNISSUED_SIGN });
    buyerTaxStatusRecordings.push(
      ["fe-param-get-condicion-iva-receptor", withIssuedTicket.raw()],
      ["fe-param-get-condicion-iva-receptor-token-error", withUnissuedTicket.raw()],
    );

    const consumer =
      buyerTaxStatusSet.kind === "fetched"
        ? selectConsumerBuyerTaxStatus(buyerTaxStatusSet.options)
        : undefined;
    if (consumer !== undefined) {
      const lastAuthorizedCall = capturedBy("FECompUltimoAutorizado");
      const lastAuthorized = await new WsfeTaxAuthorityLastAuthorized({
        endpoint: options.wsfeEndpoint,
        cuit: options.cuit,
        onRawResponse: lastAuthorizedCall.onRawResponse,
        ...timeout,
      }).lastAuthorized({ token: first.token, pointOfSale: options.pointOfSale });
      invoicingRecordings.push(["fe-comp-ultimo-autorizado", lastAuthorizedCall.raw()]);

      if (lastAuthorized.kind === "read") {
        const invoice = {
          token: first.token,
          pointOfSale: options.pointOfSale,
          issuedOn: options.now().toISOString().slice(0, 10),
          total: INVOICE_TOTAL_CENTS,
        };
        const invoiceRecordings: [string, number, number][] = [
          ["fe-cae-solicitar-authorized", lastAuthorized.number + 1, consumer.code],
          [
            "fe-cae-solicitar-rejected-content",
            lastAuthorized.number + 2,
            INVALID_BUYER_TAX_STATUS_CODE,
          ],
          ["fe-cae-solicitar-rejected-out-of-order", lastAuthorized.number + 1, consumer.code],
        ];
        for (const [name, number, buyerTaxStatusCode] of invoiceRecordings) {
          const call = capturedBy(`FECAESolicitar (${name})`);
          await new WsfeTaxAuthorityInvoicing({
            endpoint: options.wsfeEndpoint,
            cuit: options.cuit,
            onRawResponse: call.onRawResponse,
            ...timeout,
          }).solicit({ ...invoice, number, buyerTaxStatusCode });
          invoicingRecordings.push([name, call.raw()]);
        }
        invoicesRecorded = true;
      }
    }
  }
  logins += 1;
  current = secondLogin;
  await authentication.requestToken(WSAA_SERVICE);
  const alreadyAuthenticated = secondLogin.raw();

  await mkdir(options.outDir, { recursive: true });
  const scrubbed: ArcaRecordingReport["scrubbed"] = [];
  const recordings = [
    ["fe-dummy", feDummy],
    ["login-cms-issued", issued],
    ...buyerTaxStatusRecordings,
    ...invoicingRecordings,
    ["login-cms-already-authenticated", alreadyAuthenticated],
  ] as const;
  for (const [name, raw] of recordings) {
    const result = scrubArcaRecording(raw);
    const file = `${name}.scrubbed.xml`;
    await writeFile(join(options.outDir, `${name}.raw.xml`), raw);
    await writeFile(join(options.outDir, file), result.text);
    scrubbed.push({ file, replacements: result.replacements });
  }
  return { firstLoginIssuedTicket: first.kind === "issued", invoicesRecorded, scrubbed };
}
