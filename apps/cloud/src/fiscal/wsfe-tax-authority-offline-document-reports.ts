import { FACTURA_C_VOUCHER_TYPE, generationStampOf } from "@purosur/domain";
import type {
  OfflineDocumentBatchLimitAnswer,
  OfflineDocumentLastReportedAnswer,
  OfflineDocumentLastReportedCall,
  OfflineDocumentReportAnswer,
  OfflineDocumentReportCall,
  TaxAuthorityOfflineDocumentReports,
  WsaaToken,
} from "@purosur/domain/fiscal/use-cases";
import type { Client } from "soap";
import { createWsfeClient, rejectionsOf } from "./wsfe-client.js";
import { facturaCDetail } from "./wsfe-factura-c-detail.js";
import { owedPresentationsOf } from "./wsfe-owed-presentations.js";

const OFFLINE_DOCUMENT_REPORT_TIMEOUT_MS = 30_000;
const NO_ANSWER = { kind: "no_answer" } as const;

export interface WsfeTaxAuthorityOfflineDocumentReportsOptions {
  endpoint: string;
  cuit: string;
  timeoutMs?: number;
  onRawResponse?: (raw: string) => void;
}

interface LastReportedResult {
  CbteNro?: unknown;
  Errors?: unknown;
}

interface BatchLimitResult {
  RegXReq?: unknown;
  Errors?: unknown;
}

interface DetailResponse {
  CbteDesde?: unknown;
  Resultado?: unknown;
  Observaciones?: unknown;
}

interface ReportResult {
  FeDetResp?: { FECAEADetResponse?: DetailResponse | DetailResponse[] };
  Errors?: unknown;
}

export class WsfeTaxAuthorityOfflineDocumentReports implements TaxAuthorityOfflineDocumentReports {
  private readonly endpoint: string;
  private readonly cuitDigits: string;
  private readonly timeoutMs: number;
  private readonly onRawResponse: ((raw: string) => void) | undefined;
  private client: Promise<Client> | undefined;

  constructor({
    endpoint,
    cuit,
    timeoutMs = OFFLINE_DOCUMENT_REPORT_TIMEOUT_MS,
    onRawResponse,
  }: WsfeTaxAuthorityOfflineDocumentReportsOptions) {
    this.endpoint = endpoint;
    this.cuitDigits = cuit.replaceAll("-", "");
    this.timeoutMs = timeoutMs;
    this.onRawResponse = onRawResponse;
  }

  async lastReported({
    token,
    pointOfSaleNumber,
  }: OfflineDocumentLastReportedCall): Promise<OfflineDocumentLastReportedAnswer> {
    const result = await this.call<LastReportedResult>("FECompUltimoAutorizado", token, {
      PtoVta: pointOfSaleNumber,
      CbteTipo: FACTURA_C_VOUCHER_TYPE,
    });
    if (result === undefined) {
      return NO_ANSWER;
    }
    const rejections = rejectionsOf(result.Errors, "Err");
    if (rejections.length > 0) {
      return { kind: "refused", rejections };
    }
    return typeof result.CbteNro === "number"
      ? { kind: "read", number: result.CbteNro }
      : NO_ANSWER;
  }

  async batchLimit(token: WsaaToken): Promise<OfflineDocumentBatchLimitAnswer> {
    const result = await this.call<BatchLimitResult>("FECompTotXRequest", token, {});
    if (result === undefined) {
      return NO_ANSWER;
    }
    const rejections = rejectionsOf(result.Errors, "Err");
    if (rejections.length > 0) {
      return { kind: "refused", rejections };
    }
    return typeof result.RegXReq === "number" &&
      Number.isInteger(result.RegXReq) &&
      result.RegXReq >= 1
      ? { kind: "read", limit: result.RegXReq }
      : NO_ANSWER;
  }

  async report({
    token,
    pointOfSaleNumber,
    code,
    documents,
  }: OfflineDocumentReportCall): Promise<OfflineDocumentReportAnswer> {
    const result = await this.call<ReportResult>("FECAEARegInformativo", token, {
      FeCAEARegInfReq: {
        FeCabReq: {
          CantReg: documents.length,
          PtoVta: pointOfSaleNumber,
          CbteTipo: FACTURA_C_VOUCHER_TYPE,
        },
        FeDetReq: {
          FECAEADetRequest: documents.map((document) => ({
            ...facturaCDetail(document),
            CAEA: code,
            CbteFchHsGen: generationStampOf(document.generatedAt),
          })),
        },
      },
    });
    if (result === undefined) {
      return NO_ANSWER;
    }
    const refusals = rejectionsOf(result.Errors, "Err");
    const listed = result.FeDetResp?.FECAEADetResponse;
    const details = Array.isArray(listed) ? listed : listed === undefined ? [] : [listed];
    const owedPresentations = owedPresentationsOf([
      ...refusals,
      ...details.flatMap(({ Observaciones }) => rejectionsOf(Observaciones, "Obs")),
    ]);
    const listing = owedPresentations.length > 0 ? { owedPresentations } : {};
    if (refusals.length > 0) {
      return { kind: "refused", rejections: refusals, ...listing };
    }
    if (details.length === 0) {
      return NO_ANSWER;
    }
    const rejected = details.find(({ Resultado }) => Resultado !== "A");
    if (rejected === undefined) {
      return { kind: "accepted", ...listing };
    }
    return typeof rejected.CbteDesde === "number"
      ? {
          kind: "rejected",
          number: rejected.CbteDesde,
          rejections: rejectionsOf(rejected.Observaciones, "Obs"),
          ...listing,
        }
      : NO_ANSWER;
  }

  private async call<TResult>(
    operation: "FECompUltimoAutorizado" | "FECompTotXRequest" | "FECAEARegInformativo",
    { token, sign }: WsaaToken,
    body: Record<string, unknown>,
  ): Promise<TResult | undefined> {
    try {
      this.client ??= createWsfeClient(this.endpoint);
      const client = await this.client;
      let answer: unknown;
      try {
        [answer] = await client[`${operation}Async`](
          { Auth: { Token: token, Sign: sign, Cuit: this.cuitDigits }, ...body },
          { timeout: this.timeoutMs },
        );
      } finally {
        if (typeof client.lastResponse === "string") {
          this.onRawResponse?.(client.lastResponse);
        }
      }
      return (answer as Record<string, TResult | undefined>)?.[`${operation}Result`];
    } catch {
      return undefined;
    }
  }
}
