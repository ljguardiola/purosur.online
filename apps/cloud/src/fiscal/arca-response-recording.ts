import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  argentinaCalendarDay,
  FACTURA_C_DOCUMENT_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
  fortnightAfter,
  fortnightContaining,
  fortnightsWithinRequestWindowOn,
  invoiceDateOf,
  isPointOfSaleNumber,
  selectConsumerBuyerTaxStatus,
} from "@purosur/domain";
import type {
  Fortnight,
  OfflineAuthorizationCodeRequestAnswer,
  OfflineDocumentOfFortnight,
  OfflineDocumentReportAnswer,
  WsaaToken,
} from "@purosur/domain/fiscal/use-cases";
import { requireAuthorizedCuit } from "../server.js";
import { arcaCredentialsOf } from "./arca-credentials.js";
import { type ScrubReplacement, scrubArcaRecording } from "./scrub-arca-recording.js";
import { ArcaWsaaAuthentication } from "./wsaa-authentication.js";
import { WsfeArcaVitalityService } from "./wsfe-arca-vitality-service.js";
import { WsfeBuyerTaxStatusSource } from "./wsfe-buyer-tax-status-source.js";
import { WsfeTaxAuthorityInvoicing } from "./wsfe-tax-authority-invoicing.js";
import { WsfeTaxAuthorityLastAuthorized } from "./wsfe-tax-authority-last-authorized.js";
import { WsfeTaxAuthorityOfflineAuthorizationCodes } from "./wsfe-tax-authority-offline-authorization-codes.js";
import { WsfeTaxAuthorityOfflineDocumentReports } from "./wsfe-tax-authority-offline-document-reports.js";
import { WsfeTaxAuthorityVouchers } from "./wsfe-tax-authority-vouchers.js";

const WSAA_SERVICE = "wsfe";
const UNISSUED_TOKEN = "FICTIONAL-TOKEN-0001";
const UNISSUED_SIGN = "FICTIONAL-SIGN-0001";
const INVOICE_TOTAL_CENTS = 10_000;
const INVALID_BUYER_TAX_STATUS_CODE = 99_999;
const OBSERVATION_RECORDED_WITH_THE_REPORTS = 15_014;
const HALF_OF_INVOICE_TOTAL_CENTS = INVOICE_TOTAL_CENTS / 2;
const OUT_OF_SEQUENCE_OFFSET = 10;
const USAGE =
  "usage: record-arca-responses --out <directory> --point-of-sale <number> --offline-point-of-sale <number>";
const FLAGS = ["--out", "--point-of-sale", "--offline-point-of-sale"];

export type RecordingSettingsResult =
  | {
      kind: "ready";
      settings: Pick<
        RecordArcaResponsesOptions,
        | "outDir"
        | "pointOfSale"
        | "offlinePointOfSale"
        | "certificatePem"
        | "privateKeyPem"
        | "cuit"
      >;
    }
  | { kind: "refused"; reason: string };

function pointOfSaleOf(text: string): number | undefined {
  const number = Number(text);
  return /^\d+$/.test(text) && isPointOfSaleNumber(number) ? number : undefined;
}

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
  const offlinePointOfSaleText = values.get("--offline-point-of-sale");
  if (!outDir || pointOfSaleText === undefined || offlinePointOfSaleText === undefined) {
    return { kind: "refused", reason: USAGE };
  }
  const pointOfSale = pointOfSaleOf(pointOfSaleText);
  if (pointOfSale === undefined) {
    return { kind: "refused", reason: "--point-of-sale must be a point of sale number" };
  }
  const offlinePointOfSale = pointOfSaleOf(offlinePointOfSaleText);
  if (offlinePointOfSale === undefined) {
    return { kind: "refused", reason: "--offline-point-of-sale must be a point of sale number" };
  }
  if (offlinePointOfSale === pointOfSale) {
    return {
      kind: "refused",
      reason: "--offline-point-of-sale must differ from --point-of-sale",
    };
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
      offlinePointOfSale,
      certificatePem: credentials.certificatePem,
      privateKeyPem: credentials.privateKeyPem,
      cuit,
    },
  };
}

export interface RecordArcaResponsesOptions {
  outDir: string;
  pointOfSale: number;
  offlinePointOfSale: number;
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
  offlineAuthorizationCodeRequests:
    | {
        first: OfflineAuthorizationCodeRequestAnswer;
        second: OfflineAuthorizationCodeRequestAnswer;
      }
    | undefined;
  currentFortnightCodeGranted: boolean;
  offlineDocumentReports:
    | {
        lastReportedNumber: number;
        accepted: OfflineDocumentReportAnswer;
        partlyRejected: OfflineDocumentReportAnswer;
      }
    | undefined;
  recordingsCarrying15014: string[];
  scrubbed: { file: string; replacements: ScrubReplacement[] }[];
}

export function recordingsCarrying15014(
  recordings: readonly (readonly [string, string])[],
): string[] {
  const carrying = new RegExp(`<Code>${OBSERVATION_RECORDED_WITH_THE_REPORTS}</Code>`);
  return recordings.filter(([, raw]) => carrying.test(raw)).map(([name]) => name);
}

function rejectionsText(rejections: { code: number; message: string }[]): string {
  return scrubArcaRecording(rejections.map(({ code, message }) => `${code}: ${message}`).join("; "))
    .text;
}

function reportAnsweredBy(answer: OfflineDocumentReportAnswer): string {
  switch (answer.kind) {
    case "accepted":
      return "its acceptance";
    case "no_answer":
      return "nothing it could read";
    case "rejected":
      return `a rejection of document ${answer.number}: ${rejectionsText(answer.rejections)}`;
    case "refused":
      return rejectionsText(answer.rejections);
  }
}

function answeredBy(answer: OfflineAuthorizationCodeRequestAnswer): string {
  switch (answer.kind) {
    case "granted":
      return "a granted code";
    case "already_granted":
      return "that the code was already granted";
    case "no_answer":
      return "nothing it could read";
    case "refused":
      return rejectionsText(answer.rejections);
  }
}

export function recordingFailure({
  firstLoginIssuedTicket,
  invoicesRecorded,
  offlineAuthorizationCodeRequests,
  currentFortnightCodeGranted,
  offlineDocumentReports,
}: ArcaRecordingReport): string | undefined {
  if (!firstLoginIssuedTicket) {
    return "the first login did not issue a ticket (ARCA may still hold a valid one for this certificate); login-cms-issued is not a ticket answer";
  }
  if (!invoicesRecorded) {
    return "ARCA listed no Consumidor Final for invoice class C or gave no last authorized number, so no invoice was requested";
  }
  if (offlineAuthorizationCodeRequests === undefined) {
    return "every fortnight whose request window is open already holds a granted offline authorization code, or ARCA did not answer whether it does, so none was requested";
  }
  const { first, second } = offlineAuthorizationCodeRequests;
  if (first.kind !== "granted") {
    return `the first FECAEASolicitar granted no offline authorization code; ARCA answered ${answeredBy(first)}`;
  }
  if (second.kind !== "already_granted") {
    return `the second FECAEASolicitar did not answer that the code was already granted; ARCA answered ${answeredBy(second)}`;
  }
  if (!currentFortnightCodeGranted) {
    return "the offline authorization code of the current fortnight is not granted, so no document was reported";
  }
  if (offlineDocumentReports === undefined) {
    return "ARCA gave no last reported number on the offline point of sale, so no document was reported";
  }
  const { lastReportedNumber, accepted, partlyRejected } = offlineDocumentReports;
  if (accepted.kind !== "accepted") {
    return `the FECAEARegInformativo of one document was not accepted; ARCA answered ${reportAnsweredBy(accepted)}`;
  }
  const rejectedNumber = lastReportedNumber + 3;
  if (partlyRejected.kind !== "rejected" || partlyRejected.number !== rejectedNumber) {
    return `the FECAEARegInformativo of three documents did not reject document ${rejectedNumber}; ARCA answered ${reportAnsweredBy(partlyRejected)}`;
  }
  return undefined;
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
  let consumerBuyerTaxStatusCode: number | undefined;
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
    consumerBuyerTaxStatusCode = consumer?.code;
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
          issuedOn: invoiceDateOf(options.now()),
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
  const offlineAuthorizationCodes =
    first.kind === "issued"
      ? await recordOfflineAuthorizationCodes(options, first.token)
      : { recordings: [], requests: undefined };
  const offlineDocumentReports =
    first.kind === "issued"
      ? await recordOfflineDocumentReports(options, first.token, consumerBuyerTaxStatusCode)
      : { recordings: [], currentFortnightCodeGranted: false, reports: undefined };
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
    ...offlineAuthorizationCodes.recordings,
    ...offlineDocumentReports.recordings,
    ["login-cms-already-authenticated", alreadyAuthenticated],
  ] as const;
  for (const [name, raw] of recordings) {
    const result = scrubArcaRecording(raw);
    const file = `${name}.scrubbed.xml`;
    await writeFile(join(options.outDir, `${name}.raw.xml`), raw);
    await writeFile(join(options.outDir, file), result.text);
    scrubbed.push({ file, replacements: result.replacements });
  }
  return {
    firstLoginIssuedTicket: first.kind === "issued",
    invoicesRecorded,
    offlineAuthorizationCodeRequests: offlineAuthorizationCodes.requests,
    currentFortnightCodeGranted: offlineDocumentReports.currentFortnightCodeGranted,
    offlineDocumentReports: offlineDocumentReports.reports,
    recordingsCarrying15014: recordingsCarrying15014(recordings),
    scrubbed,
  };
}

async function recordOfflineAuthorizationCodes(
  options: RecordArcaResponsesOptions,
  token: WsaaToken,
): Promise<{
  recordings: [string, string][];
  requests: ArcaRecordingReport["offlineAuthorizationCodeRequests"];
}> {
  const { timeoutMs } = options;
  const codesCapturedBy = (call: ReturnType<typeof capturedBy>) =>
    new WsfeTaxAuthorityOfflineAuthorizationCodes({
      endpoint: options.wsfeEndpoint,
      cuit: options.cuit,
      onRawResponse: call.onRawResponse,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
  const withinWindow = fortnightsWithinRequestWindowOn(argentinaCalendarDay(options.now()));
  let target: { fortnight: Fortnight; notGranted: string } | undefined;
  for (const fortnight of [...withinWindow].reverse()) {
    const lookup = capturedBy("FECAEAConsultar");
    const answer = await codesCapturedBy(lookup).lookUp({ token, fortnight });
    const raw = lookup.raw();
    if (answer.kind !== "granted") {
      target = answer.kind === "not_granted" ? { fortnight, notGranted: raw } : undefined;
      break;
    }
  }
  if (target === undefined) {
    return { recordings: [], requests: undefined };
  }

  const { fortnight } = target;
  const lastWithinWindow = withinWindow[withinWindow.length - 1] as Fortnight;
  const recordings: [string, string][] = [["fe-caea-consultar-not-granted", target.notGranted]];
  const requestCapturedBy = async (name: string) => {
    const call = capturedBy(`FECAEA (${name})`);
    const answer = await codesCapturedBy(call).request({ token, fortnight });
    recordings.push([name, call.raw()]);
    return answer;
  };
  const requests = {
    first: await requestCapturedBy("fe-caea-solicitar-granted"),
    second: await requestCapturedBy("fe-caea-solicitar-already-granted"),
  };
  const calls: [string, (codes: WsfeTaxAuthorityOfflineAuthorizationCodes) => Promise<unknown>][] =
    [
      ["fe-caea-consultar-granted", (codes) => codes.lookUp({ token, fortnight })],
      [
        "fe-caea-consultar-token-error",
        (codes) =>
          codes.lookUp({
            token: { ...token, token: UNISSUED_TOKEN, sign: UNISSUED_SIGN },
            fortnight,
          }),
      ],
      [
        "fe-caea-solicitar-out-of-window",
        (codes) =>
          codes.request({ token, fortnight: fortnightAfter(fortnightAfter(lastWithinWindow)) }),
      ],
    ];
  for (const [name, make] of calls) {
    const call = capturedBy(`FECAEA (${name})`);
    await make(codesCapturedBy(call));
    recordings.push([name, call.raw()]);
  }
  return { recordings, requests };
}

async function recordOfflineDocumentReports(
  options: RecordArcaResponsesOptions,
  token: WsaaToken,
  consumerBuyerTaxStatusCode: number | undefined,
): Promise<{
  recordings: [string, string][];
  currentFortnightCodeGranted: boolean;
  reports: ArcaRecordingReport["offlineDocumentReports"];
}> {
  const { timeoutMs, offlinePointOfSale } = options;
  const connection = {
    endpoint: options.wsfeEndpoint,
    cuit: options.cuit,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
  const unissuedToken = { ...token, token: UNISSUED_TOKEN, sign: UNISSUED_SIGN };
  const recordings: [string, string][] = [];
  const recorded = async <TAnswer>(
    operation: string,
    name: string,
    make: (onRawResponse: (raw: string) => void) => Promise<TAnswer>,
  ): Promise<TAnswer> => {
    const call = capturedBy(`${operation} (${name})`);
    const answer = await make(call.onRawResponse);
    recordings.push([name, call.raw()]);
    return answer;
  };
  const reportsWith = (onRawResponse: (raw: string) => void) =>
    new WsfeTaxAuthorityOfflineDocumentReports({ ...connection, onRawResponse });
  const codesWith = (onRawResponse: (raw: string) => void) =>
    new WsfeTaxAuthorityOfflineAuthorizationCodes({ ...connection, onRawResponse });

  await recorded("FECompTotXRequest", "fe-comp-tot-x-request", (onRawResponse) =>
    reportsWith(onRawResponse).batchLimit(token),
  );
  await recorded("FECompTotXRequest", "fe-comp-tot-x-request-token-error", (onRawResponse) =>
    reportsWith(onRawResponse).batchLimit(unissuedToken),
  );

  const fortnight = fortnightContaining(argentinaCalendarDay(options.now()));
  const lookup = capturedBy("FECAEAConsultar (the current fortnight)");
  const looked = await codesWith(lookup.onRawResponse).lookUp({ token, fortnight });
  let code: string | undefined;
  if (looked.kind === "granted") {
    code = looked.code.code;
  } else if (looked.kind === "not_granted") {
    recordings.push(["fe-caea-consultar-current-not-granted", lookup.raw()]);
    const requestCall = capturedBy("FECAEASolicitar (the current fortnight)");
    const requested = await codesWith(requestCall.onRawResponse).request({ token, fortnight });
    if (requested.kind === "granted") {
      recordings.push(["fe-caea-solicitar-current-granted", requestCall.raw()]);
      code = requested.code.code;
    }
  }
  if (code === undefined) {
    return { recordings, currentFortnightCodeGranted: false, reports: undefined };
  }

  const last = await recorded(
    "FECompUltimoAutorizado",
    "fe-comp-ultimo-autorizado-offline",
    (onRawResponse) =>
      reportsWith(onRawResponse).lastReported({
        token,
        pointOfSaleNumber: offlinePointOfSale,
        documentType: FACTURA_C_DOCUMENT_TYPE,
      }),
  );
  if (last.kind !== "read" || consumerBuyerTaxStatusCode === undefined) {
    return { recordings, currentFortnightCodeGranted: true, reports: undefined };
  }

  const generatedAt = options.now();
  const documentNumbered = (
    number: number,
    netAmount = INVOICE_TOTAL_CENTS,
  ): OfflineDocumentOfFortnight => ({
    documentType: FACTURA_C_DOCUMENT_TYPE,
    number,
    issuedOn: invoiceDateOf(generatedAt),
    generatedAt,
    buyerDocumentType: FINAL_CONSUMER_DOCUMENT_TYPE,
    buyerDocumentNumber: FINAL_CONSUMER_DOCUMENT_NUMBER,
    buyerTaxStatusCode: consumerBuyerTaxStatusCode,
    total: INVOICE_TOTAL_CENTS,
    netAmount,
  });
  const reported = (name: string, documents: OfflineDocumentOfFortnight[], reportToken = token) =>
    recorded("FECAEARegInformativo", name, (onRawResponse) =>
      reportsWith(onRawResponse).report({
        token: reportToken,
        pointOfSaleNumber: offlinePointOfSale,
        documentType: FACTURA_C_DOCUMENT_TYPE,
        code,
        documents,
      }),
    );
  const { number } = last;
  const accepted = await reported("fe-caea-reg-informativo-accepted", [
    documentNumbered(number + 1),
  ]);
  const partlyRejected = await reported("fe-caea-reg-informativo-partly-rejected", [
    documentNumbered(number + 2),
    documentNumbered(number + 3, HALF_OF_INVOICE_TOTAL_CENTS),
    documentNumbered(number + 4),
  ]);
  await reported("fe-caea-reg-informativo-refused", [
    documentNumbered(number + OUT_OF_SEQUENCE_OFFSET),
  ]);
  await reported(
    "fe-caea-reg-informativo-token-error",
    [documentNumbered(number + 3)],
    unissuedToken,
  );
  await recorded("FECompConsultar", "fe-comp-consultar-caea-found", (onRawResponse) =>
    new WsfeTaxAuthorityVouchers({ ...connection, onRawResponse }).voucherAt({
      token,
      pointOfSale: offlinePointOfSale,
      number: number + 1,
    }),
  );
  return {
    recordings,
    currentFortnightCodeGranted: true,
    reports: { lastReportedNumber: number, accepted, partlyRejected },
  };
}
