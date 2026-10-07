import type { BuyerTaxStatusOption } from "@purosur/domain";
import type {
  BuyerTaxStatusFetchResult,
  BuyerTaxStatusSource,
  WsaaToken,
} from "@purosur/domain/fiscal/use-cases";
import type { Client } from "soap";
import { createWsfeClient } from "./wsfe-client.js";

const BUYER_TAX_STATUS_FETCH_TIMEOUT_MS = 10_000;

export interface WsfeBuyerTaxStatusSourceOptions {
  endpoint: string;
  cuit: string;
  timeoutMs?: number;
  onRawResponse?: (raw: string) => void;
}

interface CondicionIvaReceptor {
  Id?: unknown;
  Desc?: unknown;
  Cmp_Clase?: unknown;
}

interface CondicionIvaReceptorResult {
  ResultGet?: { CondicionIvaReceptor?: CondicionIvaReceptor | CondicionIvaReceptor[] };
  Errors?: unknown;
}

function optionOf({ Id, Desc, Cmp_Clase }: CondicionIvaReceptor): BuyerTaxStatusOption | undefined {
  if (typeof Id !== "number" || typeof Desc !== "string" || typeof Cmp_Clase !== "string") {
    return undefined;
  }
  return { code: Id, description: Desc, invoiceClass: Cmp_Clase };
}

function resultOf(answer: unknown): BuyerTaxStatusFetchResult {
  const result = (answer as { FEParamGetCondicionIvaReceptorResult?: CondicionIvaReceptorResult })
    ?.FEParamGetCondicionIvaReceptorResult;
  if (result?.ResultGet === undefined || result.Errors !== undefined) {
    return { kind: "failed" };
  }
  const listed = result.ResultGet.CondicionIvaReceptor ?? [];
  const options = (Array.isArray(listed) ? listed : [listed]).map(optionOf);
  if (options.some((option) => option === undefined)) {
    return { kind: "failed" };
  }
  return { kind: "fetched", options: options.filter((option) => option !== undefined) };
}

export class WsfeBuyerTaxStatusSource implements BuyerTaxStatusSource {
  private readonly endpoint: string;
  private readonly cuitDigits: string;
  private readonly timeoutMs: number;
  private readonly onRawResponse: ((raw: string) => void) | undefined;
  private client: Promise<Client> | undefined;

  constructor({
    endpoint,
    cuit,
    timeoutMs = BUYER_TAX_STATUS_FETCH_TIMEOUT_MS,
    onRawResponse,
  }: WsfeBuyerTaxStatusSourceOptions) {
    this.endpoint = endpoint;
    this.cuitDigits = cuit.replaceAll("-", "");
    this.timeoutMs = timeoutMs;
    this.onRawResponse = onRawResponse;
  }

  async fetchBuyerTaxStatusSet({ token, sign }: WsaaToken): Promise<BuyerTaxStatusFetchResult> {
    try {
      this.client ??= createWsfeClient(this.endpoint);
      const client = await this.client;
      let answer: unknown;
      try {
        [answer] = await client["FEParamGetCondicionIvaReceptorAsync"](
          { Auth: { Token: token, Sign: sign, Cuit: this.cuitDigits } },
          { timeout: this.timeoutMs },
        );
      } finally {
        if (typeof client.lastResponse === "string") {
          this.onRawResponse?.(client.lastResponse);
        }
      }
      return resultOf(answer);
    } catch {
      return { kind: "failed" };
    }
  }
}
