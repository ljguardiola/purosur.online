import { REAL_TIME_AUTHORIZATION_TIMEOUT_MS } from "@purosur/domain";
import type {
  FiscalDocumentSolicitation,
  SolicitationAnswer,
  TaxAuthorityInvoicing,
} from "@purosur/domain/fiscal/use-cases";
import type { Client } from "soap";
import { createWsfeClient, FACTURA_C_VOUCHER_TYPE, rejectionsOf } from "./wsfe-client.js";

const PRODUCTS = 1;
const FINAL_CONSUMER_DOCUMENT_TYPE = 99;
const PESOS = "PES";
const CENTS_PER_PESO = 100;

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

function yyyymmdd(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function isoDateOf(compact: unknown): string | undefined {
  const match = typeof compact === "string" ? /^(\d{4})(\d{2})(\d{2})$/.exec(compact) : null;
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

function pesosOf(cents: number): string {
  return (cents / CENTS_PER_PESO).toFixed(2);
}

function answerOf(answer: unknown): SolicitationAnswer {
  const result = (answer as { FECAESolicitarResult?: SolicitationResult })?.FECAESolicitarResult;
  if (result === undefined) {
    return { kind: "no_answer" };
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
    return { kind: "no_answer" };
  }
  if (result.FeCabResp?.Resultado === "R" || detail?.Resultado === "R") {
    return { kind: "rejected", rejections };
  }
  const withoutResult =
    result.FeCabResp?.Resultado === undefined && detail?.Resultado === undefined;
  return withoutResult ? { kind: "refused_without_result", rejections } : { kind: "no_answer" };
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
      const amount = pesosOf(total);
      let answer: unknown;
      try {
        [answer] = await client["FECAESolicitarAsync"](
          {
            Auth: { Token: token, Sign: sign, Cuit: this.cuitDigits },
            FeCAEReq: {
              FeCabReq: { CantReg: 1, PtoVta: pointOfSale, CbteTipo: FACTURA_C_VOUCHER_TYPE },
              FeDetReq: {
                FECAEDetRequest: {
                  Concepto: PRODUCTS,
                  DocTipo: FINAL_CONSUMER_DOCUMENT_TYPE,
                  DocNro: 0,
                  CbteDesde: number,
                  CbteHasta: number,
                  CbteFch: yyyymmdd(issuedOn),
                  ImpTotal: amount,
                  ImpTotConc: 0,
                  ImpNeto: amount,
                  ImpOpEx: 0,
                  ImpTrib: 0,
                  ImpIVA: 0,
                  MonId: PESOS,
                  MonCotiz: 1,
                  CondicionIVAReceptorId: buyerTaxStatusCode,
                },
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
      return { kind: "no_answer" };
    }
  }
}
