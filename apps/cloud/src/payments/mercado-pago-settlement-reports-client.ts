import type {
  ListedSettlementReport,
  MercadoPagoSettlementReports,
  SettlementReportConfigurationReading,
  SettlementReportRow,
} from "@purosur/domain/payments/use-cases";
import { z } from "zod";
import {
  parseSettlementReportDate,
  readSettlementReportCsv,
  SETTLEMENT_REPORT_KEYS,
} from "./settlement-report-csv.js";

export interface MercadoPagoSettlementReportsClientOptions {
  accessToken: string;
  fetch?: typeof globalThis.fetch;
}

const MERCADO_PAGO_API_URL = "https://api.mercadopago.com";
const REPORT_PATH = "/v1/account/settlement_report";
const CONFIGURATION_PATH = `${REPORT_PATH}/config`;
const MERCADO_PAGO_TIMEOUT_MS = 10_000;
const NOT_FOUND = 404;
const NOT_CREATED = 203;
const REQUEST_TIMEOUT = 408;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;
const BAD_REQUEST = 400;

const NEVER_SENT_FIELDS = ["notification_email_list", "sftp_info"] as const;

const NEW_CONFIGURATION = {
  file_name_prefix: "purosur-settlement",
  columns: SETTLEMENT_REPORT_KEYS.map((key) => ({ key })),
  separator: ";",
  display_timezone: "GMT-03",
  include_withdraw: false,
  refund_detailed: false,
  show_fee_prevision: false,
  show_chargeback_cancel: false,
  coupon_detailed: false,
  shipping_detail: false,
  frequency: { hour: 0, type: "daily", value: 1 },
};

const configurationSchema = z
  .object({ columns: z.array(z.object({ key: z.string() }).loose()) })
  .loose();

const reportDateSchema = z.string().transform((text, context) => {
  const date = parseSettlementReportDate(text);
  if (date === null) {
    context.addIssue({ code: "custom", message: "not a report date" });
    return z.NEVER;
  }
  return date;
});

const listedReportsSchema = z.array(
  z.object({
    file_name: z.string().min(1),
    begin_date: reportDateSchema,
    end_date: reportDateSchema,
    date_created: reportDateSchema,
  }),
);

const ERROR_CODE_SHAPE = /^[a-z][a-z0-9_]{0,63}$/;
const errorCodeSchema = z.object({ error: z.string().regex(ERROR_CODE_SHAPE) });

type AnswerStatus = number | "unreachable";

function warnOfAnswer(message: string, status: AnswerStatus, body: unknown): void {
  const parsed = errorCodeSchema.safeParse(body);
  console.warn(message, { status, code: parsed.success ? parsed.data.error : null });
}

type ProviderAnswer =
  | { kind: "answered"; status: number; text: string; body: unknown }
  | { kind: "unreachable" };

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function utcInstant(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

export function createMercadoPagoSettlementReportsClient(
  options: MercadoPagoSettlementReportsClientOptions,
): MercadoPagoSettlementReports {
  const doFetch = options.fetch ?? globalThis.fetch;

  async function call(
    path: string,
    method: "GET" | "POST" | "PUT",
    body?: Record<string, unknown>,
  ): Promise<ProviderAnswer> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), MERCADO_PAGO_TIMEOUT_MS);
    try {
      const response = await doFetch(`${MERCADO_PAGO_API_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: abort.signal,
      });
      const text = await response.text().catch(() => "");
      return { kind: "answered", status: response.status, text, body: parsedJson(text) };
    } catch {
      return { kind: "unreachable" };
    } finally {
      clearTimeout(timeout);
    }
  }

  function unavailable(message: string, answer: ProviderAnswer): { kind: "unavailable" } {
    if (answer.kind === "unreachable") {
      warnOfAnswer(message, "unreachable", null);
    } else {
      warnOfAnswer(message, answer.status, answer.body);
    }
    return { kind: "unavailable" };
  }

  async function currentConfiguration(): Promise<
    | {
        kind: "read";
        configuration: Record<string, unknown>;
        columns: unknown[];
        columnKeys: string[];
      }
    | { kind: "missing" }
    | { kind: "unavailable" }
  > {
    const answer = await call(CONFIGURATION_PATH, "GET");
    if (answer.kind === "answered" && answer.status === NOT_FOUND) {
      return { kind: "missing" };
    }
    const parsed =
      answer.kind === "answered" && isSuccess(answer.status)
        ? configurationSchema.safeParse(answer.body)
        : null;
    if (parsed === null || !parsed.success) {
      return unavailable("Mercado Pago did not answer the settlement report configuration", answer);
    }
    return {
      kind: "read",
      configuration: parsed.data,
      columns: parsed.data.columns,
      columnKeys: parsed.data.columns.map((column) => column.key),
    };
  }

  async function save(
    method: "POST" | "PUT",
    body: Record<string, unknown>,
  ): Promise<{ kind: "saved" } | { kind: "unavailable" }> {
    const answer = await call(CONFIGURATION_PATH, method, body);
    return answer.kind === "answered" && isSuccess(answer.status)
      ? { kind: "saved" }
      : unavailable("Mercado Pago did not save the settlement report configuration", answer);
  }

  return {
    async readConfiguration(): Promise<SettlementReportConfigurationReading> {
      const current = await currentConfiguration();
      if (current.kind !== "read") {
        return current;
      }
      return SETTLEMENT_REPORT_KEYS.every((key) => current.columnKeys.includes(key))
        ? { kind: "found" }
        : { kind: "outdated" };
    },

    createConfiguration() {
      return save("POST", NEW_CONFIGURATION);
    },

    async updateConfiguration() {
      const current = await currentConfiguration();
      if (current.kind !== "read") {
        return { kind: "unavailable" };
      }
      const kept = Object.fromEntries(
        Object.entries(current.configuration).filter(
          ([field]) => !(NEVER_SENT_FIELDS as readonly string[]).includes(field),
        ),
      );
      const missing = SETTLEMENT_REPORT_KEYS.filter((key) => !current.columnKeys.includes(key));
      return save("PUT", {
        ...kept,
        columns: [...current.columns, ...missing.map((key) => ({ key }))],
      });
    },

    async requestReport(beginDate: Date, endDate: Date) {
      const answer = await call(REPORT_PATH, "POST", {
        begin_date: utcInstant(beginDate),
        end_date: utcInstant(endDate),
      });
      if (answer.kind === "unreachable") {
        return unavailable("Mercado Pago did not answer the settlement report request", answer);
      }
      if (answer.status === 202) {
        return { kind: "requested" };
      }
      if (
        answer.status === REQUEST_TIMEOUT ||
        answer.status === TOO_MANY_REQUESTS ||
        answer.status >= SERVER_ERROR
      ) {
        return unavailable("Mercado Pago did not answer the settlement report request", answer);
      }
      if (answer.status === NOT_CREATED || answer.status >= BAD_REQUEST) {
        warnOfAnswer(
          "Mercado Pago refused the settlement report request",
          answer.status,
          answer.body,
        );
        return { kind: "refused" };
      }
      return unavailable("Mercado Pago did not answer the settlement report request", answer);
    },

    async listReports() {
      const answer = await call(`${REPORT_PATH}/list`, "GET");
      const parsed =
        answer.kind === "answered" && isSuccess(answer.status)
          ? listedReportsSchema.safeParse(answer.body)
          : null;
      if (parsed === null || !parsed.success) {
        return unavailable("Mercado Pago did not answer the settlement report list", answer);
      }
      const reports: ListedSettlementReport[] = parsed.data.map((report) => ({
        fileName: report.file_name,
        beginDate: report.begin_date,
        endDate: report.end_date,
        createdAt: report.date_created,
      }));
      return { kind: "listed", reports };
    },

    async downloadReport(fileName: string) {
      const answer = await call(`${REPORT_PATH}/${encodeURIComponent(fileName)}`, "GET");
      if (answer.kind === "unreachable" || !isSuccess(answer.status)) {
        return unavailable("Mercado Pago did not answer the settlement report file", answer);
      }
      const rows: SettlementReportRow[] | null = readSettlementReportCsv(answer.text);
      if (rows === null) {
        warnOfAnswer("The settlement report file could not be read", answer.status, null);
        return { kind: "unavailable" };
      }
      return { kind: "downloaded", rows };
    },
  };
}
