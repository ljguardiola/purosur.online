import type {
  LastAuthorizedAnswer,
  TaxAuthorityLastAuthorizedLookup,
  WsaaToken,
} from "@purosur/domain/fiscal/use-cases";
import type { Client } from "soap";
import { codesOf, createWsfeClient, FACTURA_C_VOUCHER_TYPE } from "./wsfe-client.js";

const LAST_AUTHORIZED_TIMEOUT_MS = 10_000;

export interface WsfeTaxAuthorityLastAuthorizedOptions {
  endpoint: string;
  cuit: string;
  timeoutMs?: number;
  onRawResponse?: (raw: string) => void;
}

interface LastAuthorizedResult {
  CbteNro?: unknown;
  Errors?: unknown;
}

function answerOf(answer: unknown): LastAuthorizedAnswer {
  const result = (answer as { FECompUltimoAutorizadoResult?: LastAuthorizedResult })
    ?.FECompUltimoAutorizadoResult;
  if (
    result === undefined ||
    codesOf(result.Errors, "Err").length > 0 ||
    typeof result.CbteNro !== "number"
  ) {
    return { kind: "no_answer" };
  }
  return { kind: "read", number: result.CbteNro };
}

export class WsfeTaxAuthorityLastAuthorized implements TaxAuthorityLastAuthorizedLookup {
  private readonly endpoint: string;
  private readonly cuitDigits: string;
  private readonly timeoutMs: number;
  private readonly onRawResponse: ((raw: string) => void) | undefined;
  private client: Promise<Client> | undefined;

  constructor({
    endpoint,
    cuit,
    timeoutMs = LAST_AUTHORIZED_TIMEOUT_MS,
    onRawResponse,
  }: WsfeTaxAuthorityLastAuthorizedOptions) {
    this.endpoint = endpoint;
    this.cuitDigits = cuit.replaceAll("-", "");
    this.timeoutMs = timeoutMs;
    this.onRawResponse = onRawResponse;
  }

  async lastAuthorized({
    token: { token, sign },
    pointOfSale,
  }: {
    token: WsaaToken;
    pointOfSale: number;
  }): Promise<LastAuthorizedAnswer> {
    try {
      this.client ??= createWsfeClient(this.endpoint);
      const client = await this.client;
      let answer: unknown;
      try {
        [answer] = await client["FECompUltimoAutorizadoAsync"](
          {
            Auth: { Token: token, Sign: sign, Cuit: this.cuitDigits },
            PtoVta: pointOfSale,
            CbteTipo: FACTURA_C_VOUCHER_TYPE,
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
