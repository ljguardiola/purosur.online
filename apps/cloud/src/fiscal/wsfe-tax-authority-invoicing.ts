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
import { createWsfeClient } from "./wsfe-client.js";
import { facturaCDetail } from "./wsfe-factura-c-detail.js";
import { NO_ANSWER, solicitationAnswerOf } from "./wsfe-solicitation-answer.js";

export interface WsfeTaxAuthorityInvoicingOptions {
  endpoint: string;
  cuit: string;
  timeoutMs?: number;
  onRawResponse?: (raw: string) => void;
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
      return solicitationAnswerOf(answer);
    } catch {
      return NO_ANSWER;
    }
  }
}
