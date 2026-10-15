import {
  FACTURA_C_VOUCHER_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
  REAL_TIME_AUTHORIZATION_TIMEOUT_MS,
} from "@purosur/domain";
import type {
  FiscalDocumentSolicitation,
  SolicitationAnswer,
  TaxAuthorityInvoicing,
} from "@purosur/domain/fiscal/use-cases";
import type { Client } from "soap";
import { createWsfeClient, rejectionsOf } from "./wsfe-client.js";
import { facturaCDetail } from "./wsfe-factura-c-detail.js";

export interface WsfeTaxAuthorityInvoicingOptions {
  endpoint: string;
  cuit: string;
  timeoutMs?: number;
  onRawResponse?: (raw: string) => void;
}

interface DetailResponse {
  Resultado?: unknown;
  CAE?: unknown;
  CAEFchVto?: unknown;
  Observaciones?: unknown;
}

interface SolicitationResult {
  FeCabResp?: { Resultado?: unknown };
  FeDetResp?: { FECAEDetResponse?: DetailResponse | DetailResponse[] };
  Errors?: unknown;
}

function isoDateOf(compact: unknown): string | undefined {
  const match = typeof compact === "string" ? /^(\d{4})(\d{2})(\d{2})$/.exec(compact) : null;
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

const NO_ANSWER: SolicitationAnswer = { kind: "no_answer", rejections: [] };

function answerOf(answer: unknown): SolicitationAnswer {
  const result = (answer as { FECAESolicitarResult?: SolicitationResult })?.FECAESolicitarResult;
  if (result === undefined) {
    return NO_ANSWER;
  }
  const listed = result.FeDetResp?.FECAEDetResponse;
  const details = Array.isArray(listed) ? listed : listed === undefined ? [] : [listed];
  const [detail] = details;

  const dueOn = isoDateOf(detail?.CAEFchVto);
  if (
    result.FeCabResp?.Resultado === "A" &&
    detail?.Resultado === "A" &&
    typeof detail.CAE === "string" &&
    detail.CAE !== "" &&
    dueOn !== undefined
  ) {
    return { kind: "authorized", authorizationCode: detail.CAE, authorizationCodeDueOn: dueOn };
  }

  const rejections = [
    ...details.flatMap(({ Observaciones }) => rejectionsOf(Observaciones, "Obs")),
    ...rejectionsOf(result.Errors, "Err"),
  ];
  if (rejections.length === 0) {
    return NO_ANSWER;
  }
  if (result.FeCabResp?.Resultado === "R" || detail?.Resultado === "R") {
    return { kind: "rejected", rejections };
  }
  const withoutResult =
    result.FeCabResp?.Resultado === undefined && detail?.Resultado === undefined;
  return withoutResult
    ? { kind: "refused_without_result", rejections }
    : { kind: "no_answer", rejections };
}

export class WsfeTaxAuthorityInvoicing implements TaxAuthorityInvoicing {
  private readonly endpoint: string;
  private readonly cuitDigits: string;
  private readonly timeoutMs: number;
  private readonly onRawResponse: ((raw: string) => void) | undefined;
  private client: Promise<Client> | undefined;

  constructor({
    endpoint,
    cuit,
    timeoutMs = REAL_TIME_AUTHORIZATION_TIMEOUT_MS,
    onRawResponse,
  }: WsfeTaxAuthorityInvoicingOptions) {
    this.endpoint = endpoint;
    this.cuitDigits = cuit.replaceAll("-", "");
    this.timeoutMs = timeoutMs;
    this.onRawResponse = onRawResponse;
  }

  async solicit({
    token: { token, sign },
    pointOfSale,
    number,
    issuedOn,
    total,
    buyerTaxStatusCode,
  }: FiscalDocumentSolicitation): Promise<SolicitationAnswer> {
    try {
      this.client ??= createWsfeClient(this.endpoint);
      const client = await this.client;
      let answer: unknown;
      try {
        [answer] = await client["FECAESolicitarAsync"](
          {
            Auth: { Token: token, Sign: sign, Cuit: this.cuitDigits },
            FeCAEReq: {
              FeCabReq: { CantReg: 1, PtoVta: pointOfSale, CbteTipo: FACTURA_C_VOUCHER_TYPE },
              FeDetReq: {
                FECAEDetRequest: facturaCDetail({
                  number,
                  issuedOn,
                  total,
                  netAmount: total,
                  buyerDocumentType: FINAL_CONSUMER_DOCUMENT_TYPE,
                  buyerDocumentNumber: FINAL_CONSUMER_DOCUMENT_NUMBER,
                  buyerTaxStatusCode,
                }),
              },
            },
          },
          { timeout: this.timeoutMs },
        );
      } finally {
        if (typeof client.lastResponse === "string") {
          this.onRawResponse?.(client.lastResponse);
        }
      }
      return answerOf(answer);
    } catch {
      return NO_ANSWER;
    }
  }
}
