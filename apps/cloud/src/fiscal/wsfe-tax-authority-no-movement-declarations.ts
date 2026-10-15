import type {
  NoMovementDeclarationAnswer,
  NoMovementDeclarationCall,
  NoMovementDeclarationLookupAnswer,
  TaxAuthorityNoMovementDeclarations,
} from "@purosur/domain/fiscal/use-cases";
import type { Client } from "soap";
import { createWsfeClient, rejectionsOf } from "./wsfe-client.js";

const NO_MOVEMENT_DECLARATION_TIMEOUT_MS = 30_000;
const NEVER_DECLARED_CODE = 10_102;

export interface WsfeTaxAuthorityNoMovementDeclarationsOptions {
  endpoint: string;
  cuit: string;
  timeoutMs?: number;
  onRawResponse?: (raw: string) => void;
}

interface DeclarationEntry {
  CAEA?: unknown;
  PtoVta?: unknown;
}

interface LookupResult {
  ResultGet?: { FECAEASinMov?: DeclarationEntry | DeclarationEntry[] };
  Errors?: unknown;
}

interface DeclareResult {
  Resultado?: unknown;
  Errors?: unknown;
}

export class WsfeTaxAuthorityNoMovementDeclarations implements TaxAuthorityNoMovementDeclarations {
  private readonly endpoint: string;
  private readonly cuitDigits: string;
  private readonly timeoutMs: number;
  private readonly onRawResponse: ((raw: string) => void) | undefined;
  private client: Promise<Client> | undefined;

  constructor({
    endpoint,
    cuit,
    timeoutMs = NO_MOVEMENT_DECLARATION_TIMEOUT_MS,
    onRawResponse,
  }: WsfeTaxAuthorityNoMovementDeclarationsOptions) {
    this.endpoint = endpoint;
    this.cuitDigits = cuit.replaceAll("-", "");
    this.timeoutMs = timeoutMs;
    this.onRawResponse = onRawResponse;
  }

  async lookUp(call: NoMovementDeclarationCall): Promise<NoMovementDeclarationLookupAnswer> {
    const result = await this.call<LookupResult>("FECAEASinMovimientoConsultar", call);
    if (result === undefined) {
      return { kind: "no_answer" };
    }
    const rejections = rejectionsOf(result.Errors, "Err");
    if (rejections.length === 1 && rejections[0]?.code === NEVER_DECLARED_CODE) {
      return { kind: "not_held" };
    }
    if (rejections.length > 0) {
      return { kind: "refused", rejections };
    }
    if (result.ResultGet === undefined) {
      return { kind: "no_answer" };
    }
    const listed = result.ResultGet.FECAEASinMov;
    const entries = Array.isArray(listed) ? listed : listed === undefined ? [] : [listed];
    const holdsIt = entries.some(
      ({ CAEA, PtoVta }) => CAEA === call.code && PtoVta === call.pointOfSaleNumber,
    );
    return { kind: holdsIt ? "held" : "not_held" };
  }

  async declare(call: NoMovementDeclarationCall): Promise<NoMovementDeclarationAnswer> {
    const result = await this.call<DeclareResult>("FECAEASinMovimientoInformar", call);
    if (result === undefined) {
      return { kind: "no_answer" };
    }
    const rejections = rejectionsOf(result.Errors, "Err");
    if (rejections.length > 0) {
      return { kind: "refused", rejections };
    }
    return result.Resultado === "A" ? { kind: "accepted" } : { kind: "no_answer" };
  }

  private async call<TResult>(
    operation: "FECAEASinMovimientoConsultar" | "FECAEASinMovimientoInformar",
    { token: { token, sign }, pointOfSaleNumber, code }: NoMovementDeclarationCall,
  ): Promise<TResult | undefined> {
    try {
      this.client ??= createWsfeClient(this.endpoint);
      const client = await this.client;
      let answer: unknown;
      try {
        [answer] = await client[`${operation}Async`](
          {
            Auth: { Token: token, Sign: sign, Cuit: this.cuitDigits },
            PtoVta: pointOfSaleNumber,
            CAEA: code,
          },
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
