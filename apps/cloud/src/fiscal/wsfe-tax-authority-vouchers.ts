import type {
  TaxAuthorityVoucherLookup,
  VoucherAnswer,
  WsaaToken,
} from "@purosur/domain/fiscal/use-cases";
import type { Client } from "soap";
import { codesOf, createWsfeClient } from "./wsfe-client.js";

const VOUCHER_LOOKUP_TIMEOUT_MS = 10_000;
const CENTS_PER_PESO = 100;
const NO_DATA_FOR_THE_PARAMETERS = 602;

export interface WsfeTaxAuthorityVouchersOptions {
  endpoint: string;
  cuit: string;
  timeoutMs?: number;
  onRawResponse?: (raw: string) => void;
}

interface VoucherResult {
  ResultGet?: {
    CbteFch?: unknown;
    ImpTotal?: unknown;
    CbteTipo?: unknown;
    DocTipo?: unknown;
    DocNro?: unknown;
    CondicionIVAReceptorId?: unknown;
    CodAutorizacion?: unknown;
    FchVto?: unknown;
  };
  Errors?: unknown;
}

function isoDateOf(compact: unknown): string | undefined {
  const match = typeof compact === "string" ? /^(\d{4})(\d{2})(\d{2})$/.exec(compact) : null;
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

function answerOf(answer: unknown): VoucherAnswer {
  const result = (answer as { FECompConsultarResult?: VoucherResult })?.FECompConsultarResult;
  if (result === undefined) {
    return { kind: "no_answer" };
  }
  const errorCodes = codesOf(result.Errors, "Err");
  if (errorCodes.length > 0) {
    return errorCodes.includes(NO_DATA_FOR_THE_PARAMETERS)
      ? { kind: "none" }
      : { kind: "no_answer" };
  }
  const voucher = result.ResultGet;
  const issuedOn = isoDateOf(voucher?.CbteFch);
  const authorizationCodeDueOn = isoDateOf(voucher?.FchVto);
  if (
    voucher === undefined ||
    issuedOn === undefined ||
    authorizationCodeDueOn === undefined ||
    typeof voucher.ImpTotal !== "number" ||
    typeof voucher.CbteTipo !== "number" ||
    typeof voucher.DocTipo !== "number" ||
    typeof voucher.DocNro !== "number" ||
    typeof voucher.CondicionIVAReceptorId !== "number" ||
    typeof voucher.CodAutorizacion !== "string" ||
    voucher.CodAutorizacion === ""
  ) {
    return { kind: "no_answer" };
  }
  return {
    kind: "found",
    voucher: {
      issuedOn,
      total: Math.round(voucher.ImpTotal * CENTS_PER_PESO),
      documentType: voucher.CbteTipo,
      receiverDocumentType: voucher.DocTipo,
      receiverDocumentNumber: voucher.DocNro,
      receiverTaxStatusCode: voucher.CondicionIVAReceptorId,
      authorizationCode: voucher.CodAutorizacion,
      authorizationCodeDueOn,
    },
  };
}

export class WsfeTaxAuthorityVouchers implements TaxAuthorityVoucherLookup {
  private readonly endpoint: string;
  private readonly cuitDigits: string;
  private readonly timeoutMs: number;
  private readonly onRawResponse: ((raw: string) => void) | undefined;
  private client: Promise<Client> | undefined;

  constructor({
    endpoint,
    cuit,
    timeoutMs = VOUCHER_LOOKUP_TIMEOUT_MS,
    onRawResponse,
  }: WsfeTaxAuthorityVouchersOptions) {
    this.endpoint = endpoint;
    this.cuitDigits = cuit.replaceAll("-", "");
    this.timeoutMs = timeoutMs;
    this.onRawResponse = onRawResponse;
  }

  async voucherAt({
    token: { token, sign },
    pointOfSale,
    voucherType,
    number,
  }: {
    token: WsaaToken;
    pointOfSale: number;
    voucherType: number;
    number: number;
  }): Promise<VoucherAnswer> {
    try {
      this.client ??= createWsfeClient(this.endpoint);
      const client = await this.client;
      let answer: unknown;
      try {
        [answer] = await client["FECompConsultarAsync"](
          {
            Auth: { Token: token, Sign: sign, Cuit: this.cuitDigits },
            FeCompConsReq: {
              CbteTipo: voucherType,
              CbteNro: number,
              PtoVta: pointOfSale,
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
