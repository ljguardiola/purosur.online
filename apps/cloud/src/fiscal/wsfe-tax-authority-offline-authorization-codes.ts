import type {
  Fortnight,
  OfflineAuthorizationCode,
  OfflineAuthorizationCodeCall,
  OfflineAuthorizationCodeLookupAnswer,
  OfflineAuthorizationCodeRequestAnswer,
  TaxAuthorityOfflineAuthorizationCodes,
  TaxAuthorityRejection,
} from "@purosur/domain/fiscal/use-cases";
import type { Client } from "soap";
import { createWsfeClient, rejectionsOf } from "./wsfe-client.js";

const OFFLINE_AUTHORIZATION_CODE_TIMEOUT_MS = 30_000;
const ALREADY_GRANTED_CODE = 15_008;
const NOT_GRANTED_CODE = 602;
const SECOND_HALF_FIRST_DAY = "16";

export interface WsfeTaxAuthorityOfflineAuthorizationCodesOptions {
  endpoint: string;
  cuit: string;
  timeoutMs?: number;
  onRawResponse?: (raw: string) => void;
}

interface CodeResult {
  ResultGet?: {
    CAEA?: unknown;
    FchVigDesde?: unknown;
    FchVigHasta?: unknown;
    FchTopeInf?: unknown;
  };
  Errors?: unknown;
}

type Read =
  | { kind: "granted"; code: OfflineAuthorizationCode }
  | { kind: "refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "no_answer" };

function isoDateOf(compact: unknown): string | undefined {
  return typeof compact === "string" && /^\d{8}$/.test(compact)
    ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
    : undefined;
}

function readOf(result: CodeResult | undefined): Read {
  if (result === undefined) {
    return { kind: "no_answer" };
  }
  const rejections = rejectionsOf(result.Errors, "Err");
  if (rejections.length > 0) {
    return { kind: "refused", rejections };
  }
  const granted = result.ResultGet;
  const start = isoDateOf(granted?.FchVigDesde);
  const end = isoDateOf(granted?.FchVigHasta);
  const reportDeadline = isoDateOf(granted?.FchTopeInf);
  if (
    typeof granted?.CAEA !== "string" ||
    granted.CAEA === "" ||
    start === undefined ||
    end === undefined ||
    reportDeadline === undefined
  ) {
    return { kind: "no_answer" };
  }
  return {
    kind: "granted",
    code: { code: granted.CAEA, fortnight: { start, end }, reportDeadline },
  };
}

function isOnly(rejections: TaxAuthorityRejection[], code: number): boolean {
  return rejections.length === 1 && rejections[0]?.code === code;
}

function periodOf({ start }: Fortnight): { Periodo: number; Orden: number } {
  return {
    Periodo: Number(`${start.slice(0, 4)}${start.slice(5, 7)}`),
    Orden: start.slice(8, 10) === SECOND_HALF_FIRST_DAY ? 2 : 1,
  };
}

export class WsfeTaxAuthorityOfflineAuthorizationCodes
  implements TaxAuthorityOfflineAuthorizationCodes
{
  private readonly endpoint: string;
  private readonly cuitDigits: string;
  private readonly timeoutMs: number;
  private readonly onRawResponse: ((raw: string) => void) | undefined;
  private client: Promise<Client> | undefined;

  constructor({
    endpoint,
    cuit,
    timeoutMs = OFFLINE_AUTHORIZATION_CODE_TIMEOUT_MS,
    onRawResponse,
  }: WsfeTaxAuthorityOfflineAuthorizationCodesOptions) {
    this.endpoint = endpoint;
    this.cuitDigits = cuit.replaceAll("-", "");
    this.timeoutMs = timeoutMs;
    this.onRawResponse = onRawResponse;
  }

  async request(
    call: OfflineAuthorizationCodeCall,
  ): Promise<OfflineAuthorizationCodeRequestAnswer> {
    const read = await this.call("FECAEASolicitar", call);
    return read.kind === "refused" && isOnly(read.rejections, ALREADY_GRANTED_CODE)
      ? { kind: "already_granted" }
      : read;
  }

  async lookUp(call: OfflineAuthorizationCodeCall): Promise<OfflineAuthorizationCodeLookupAnswer> {
    const read = await this.call("FECAEAConsultar", call);
    return read.kind === "refused" && isOnly(read.rejections, NOT_GRANTED_CODE)
      ? { kind: "not_granted" }
      : read;
  }

  private async call(
    operation: "FECAEASolicitar" | "FECAEAConsultar",
    { token: { token, sign }, fortnight }: OfflineAuthorizationCodeCall,
  ): Promise<Read> {
    try {
      this.client ??= createWsfeClient(this.endpoint);
      const client = await this.client;
      let answer: unknown;
      try {
        [answer] = await client[`${operation}Async`](
          { Auth: { Token: token, Sign: sign, Cuit: this.cuitDigits }, ...periodOf(fortnight) },
          { timeout: this.timeoutMs },
        );
      } finally {
        if (typeof client.lastResponse === "string") {
          this.onRawResponse?.(client.lastResponse);
        }
      }
      return readOf((answer as Record<string, CodeResult | undefined>)?.[`${operation}Result`]);
    } catch {
      return { kind: "no_answer" };
    }
  }
}
