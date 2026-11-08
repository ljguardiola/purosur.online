import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMercadoPagoSettlementReportsClient } from "./mercado-pago-settlement-reports-client.js";
import {
  CONFIGURATION_NOT_FOUND,
  CSV_HEADER,
  documentedConfiguration,
  documentedReportList,
  READ_COLUMN_KEYS,
  REPORT_FILE_NAME,
  SALE_ROW,
  settlementReportCsv,
} from "./test-support/mercado-pago-documented-settlement-reports.js";

const ACCESS_TOKEN = "APP_USR-fictional-access-token-0001";
const BASE = "https://api.mercadopago.com/v1/account/settlement_report";

function answer(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

function clientAnswering(...responses: (Response | Error)[]) {
  const queue = [...responses];
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("test setup: no answer left");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
  return {
    client: createMercadoPagoSettlementReportsClient({ accessToken: ACCESS_TOKEN, fetch }),
    fetch,
  };
}

function sentRequest(fetch: ReturnType<typeof clientAnswering>["fetch"], call = 0) {
  const [url, init] = fetch.mock.calls[call] ?? [];
  const request = init as RequestInit;
  return {
    url,
    method: request.method,
    headers: request.headers as Record<string, string>,
    body: typeof request.body === "string" ? (JSON.parse(request.body) as unknown) : request.body,
  };
}

const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;
let consoleCalls: unknown[][];

beforeEach(() => {
  consoleCalls = [];
  for (const method of consoleMethods) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("reading the configuration", () => {
  it("asks for the configuration with the access token", async () => {
    const { client, fetch } = clientAnswering(answer(200, documentedConfiguration()));

    await client.readConfiguration();

    expect(sentRequest(fetch)).toMatchObject({
      url: `${BASE}/config`,
      method: "GET",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
  });

  it("finds a configuration that has every column the report is read with", async () => {
    const { client } = clientAnswering(answer(200, documentedConfiguration()));

    expect(await client.readConfiguration()).toEqual({ kind: "found" });
  });

  it.each(READ_COLUMN_KEYS)("finds it outdated when the column %s is missing", async (key) => {
    const keys = READ_COLUMN_KEYS.filter((column) => column !== key);
    const { client } = clientAnswering(answer(200, documentedConfiguration(keys)));

    expect(await client.readConfiguration()).toEqual({ kind: "outdated" });
  });

  it("finds the account has none when Mercado Pago answers 404", async () => {
    const { client } = clientAnswering(answer(404, CONFIGURATION_NOT_FOUND));

    expect(await client.readConfiguration()).toEqual({ kind: "missing" });
  });

  it.each([
    ["a server error", () => answer(500, { message: "boom" })],
    ["a refusal", () => answer(401, { message: "invalid token" })],
    ["a configuration without columns", () => answer(200, { separator: ";" })],
    ["a body that is not JSON", () => answer(200, "<html>")],
    ["no connection", () => new Error("connect ECONNREFUSED")],
  ])("is unavailable on %s", async (_name, response) => {
    const { client } = clientAnswering(response());

    expect(await client.readConfiguration()).toEqual({ kind: "unavailable" });
  });

  it("gives up and is unavailable when Mercado Pago does not answer in time", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const client = createMercadoPagoSettlementReportsClient({ accessToken: ACCESS_TOKEN, fetch });

    const reading = client.readConfiguration();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await reading).toEqual({ kind: "unavailable" });
  });

  it("logs only the status and never the token", async () => {
    const { client } = clientAnswering(
      answer(500, { message: "boom", error: "internal_error", status: 500 }),
    );

    await client.readConfiguration();

    expect(consoleCalls).toEqual([[expect.any(String), { status: 500, code: "internal_error" }]]);
    expect(JSON.stringify(consoleCalls)).not.toContain(ACCESS_TOKEN);
  });
});

describe("creating the configuration", () => {
  it("posts a daily, unscheduled configuration with the columns it reads and no e-mails", async () => {
    const { client, fetch } = clientAnswering(answer(201, documentedConfiguration()));

    const result = await client.createConfiguration();

    expect(result).toEqual({ kind: "saved" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sentRequest(fetch)).toMatchObject({
      url: `${BASE}/config`,
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: {
        file_name_prefix: "purosur-settlement",
        columns: READ_COLUMN_KEYS.map((key) => ({ key })),
        separator: ";",
        display_timezone: "GMT-03",
        include_withdraw: false,
        refund_detailed: false,
        show_fee_prevision: false,
        show_chargeback_cancel: false,
        coupon_detailed: false,
        shipping_detail: false,
        frequency: { hour: 0, type: "daily", value: 1 },
      },
    });
  });

  it("sends no field about scheduling, e-mails, notifications or sftp", async () => {
    const { client, fetch } = clientAnswering(answer(201, documentedConfiguration()));

    await client.createConfiguration();

    const { body } = sentRequest(fetch);
    expect(Object.keys(body as object).sort()).toEqual([
      "columns",
      "coupon_detailed",
      "display_timezone",
      "file_name_prefix",
      "frequency",
      "include_withdraw",
      "refund_detailed",
      "separator",
      "shipping_detail",
      "show_chargeback_cancel",
      "show_fee_prevision",
    ]);
  });

  it.each([
    ["a refusal", () => answer(400, { message: "invalid" })],
    ["a server error", () => answer(503, {})],
    ["no connection", () => new Error("connect ECONNREFUSED")],
  ])("is unavailable on %s", async (_name, response) => {
    const { client } = clientAnswering(response());

    expect(await client.createConfiguration()).toEqual({ kind: "unavailable" });
  });
});

describe("updating the configuration", () => {
  it("puts the configuration it reads with the missing columns appended and every other setting kept", async () => {
    const existing = documentedConfiguration(["SOURCE_ID", "TRANSACTION_TYPE", "INSTALLMENTS"]);
    const { client, fetch } = clientAnswering(answer(200, existing), answer(200, existing));

    const result = await client.updateConfiguration();

    expect(result).toEqual({ kind: "saved" });
    expect(sentRequest(fetch, 0)).toMatchObject({ url: `${BASE}/config`, method: "GET" });
    const put = sentRequest(fetch, 1);
    expect(put).toMatchObject({
      url: `${BASE}/config`,
      method: "PUT",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    });
    const { notification_email_list, sftp_info, ...kept } = existing;
    expect(notification_email_list).toBeDefined();
    expect(sftp_info).toBeDefined();
    expect(put.body).toEqual({
      ...kept,
      columns: [
        { key: "SOURCE_ID" },
        { key: "TRANSACTION_TYPE" },
        { key: "INSTALLMENTS" },
        ...READ_COLUMN_KEYS.filter((key) => key !== "SOURCE_ID" && key !== "TRANSACTION_TYPE").map(
          (key) => ({ key }),
        ),
      ],
    });
  });

  it("sends no e-mail, notification or sftp field", async () => {
    const existing = documentedConfiguration(["SOURCE_ID"]);
    const { client, fetch } = clientAnswering(answer(200, existing), answer(200, existing));

    await client.updateConfiguration();

    const body = sentRequest(fetch, 1).body as Record<string, unknown>;
    expect(body).not.toHaveProperty("notification_email_list");
    expect(body).not.toHaveProperty("sftp_info");
  });

  it("does not put anything when the configuration cannot be read", async () => {
    const { client, fetch } = clientAnswering(answer(404, CONFIGURATION_NOT_FOUND));

    expect(await client.updateConfiguration()).toEqual({ kind: "unavailable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a refusal", () => answer(400, { message: "invalid" })],
    ["a server error", () => answer(500, {})],
    ["no connection", () => new Error("connect ECONNREFUSED")],
  ])("is unavailable when the put ends in %s", async (_name, response) => {
    const existing = documentedConfiguration(["SOURCE_ID"]);
    const { client } = clientAnswering(answer(200, existing), response());

    expect(await client.updateConfiguration()).toEqual({ kind: "unavailable" });
  });
});

describe("requesting a report", () => {
  const BEGIN = new Date("2026-09-08T03:00:00.000Z");
  const END = new Date("2026-09-09T02:59:59.000Z");

  it("posts the period as ISO-8601 instants in UTC without milliseconds", async () => {
    const { client, fetch } = clientAnswering(answer(202, {}));

    const result = await client.requestReport(BEGIN, END);

    expect(result).toEqual({ kind: "requested" });
    expect(sentRequest(fetch)).toMatchObject({
      url: BASE,
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: { begin_date: "2026-09-08T03:00:00Z", end_date: "2026-09-09T02:59:59Z" },
    });
  });

  it.each([
    [203, "valid but not created"],
    [400, "a bad request"],
    [403, "forbidden"],
    [404, "not found"],
  ])("is refused when Mercado Pago answers %i (%s)", async (status) => {
    const { client } = clientAnswering(answer(status, {}));

    expect(await client.requestReport(BEGIN, END)).toEqual({ kind: "refused" });
  });

  it.each([408, 429, 500, 503])("is unavailable when Mercado Pago answers %i", async (status) => {
    const { client } = clientAnswering(answer(status, {}));

    expect(await client.requestReport(BEGIN, END)).toEqual({ kind: "unavailable" });
  });

  it("is unavailable with no connection", async () => {
    const { client } = clientAnswering(new Error("connect ECONNREFUSED"));

    expect(await client.requestReport(BEGIN, END)).toEqual({ kind: "unavailable" });
  });
});

describe("listing the reports", () => {
  it("reads the file name, the period and the creation instant of each report", async () => {
    const { client, fetch } = clientAnswering(answer(200, documentedReportList()));

    const result = await client.listReports();

    expect(sentRequest(fetch)).toMatchObject({ url: `${BASE}/list`, method: "GET" });
    expect(result).toEqual({
      kind: "listed",
      reports: [
        {
          fileName: REPORT_FILE_NAME,
          beginDate: new Date("2026-09-08T03:00:00.000Z"),
          endDate: new Date("2026-09-09T02:59:59.000Z"),
          createdAt: new Date("2026-09-09T14:07:53.000Z"),
        },
        {
          fileName: "purosur-settlement-2026-09-09.csv",
          beginDate: new Date("2026-09-09T03:00:00.000Z"),
          endDate: new Date("2026-09-10T02:59:59.000Z"),
          createdAt: new Date("2016-01-20T14:07:53.000Z"),
        },
      ],
    });
  });

  it("lists nothing when the account has no reports", async () => {
    const { client } = clientAnswering(answer(200, []));

    expect(await client.listReports()).toEqual({ kind: "listed", reports: [] });
  });

  it.each([
    ["a malformed item", () => answer(200, [...documentedReportList(), { id: 1 }])],
    [
      "an unreadable date",
      () => answer(200, [{ ...documentedReportList()[0], date_created: "x" }]),
    ],
    ["a body that is not a list", () => answer(200, { reports: [] })],
    ["a server error", () => answer(500, {})],
    ["no connection", () => new Error("connect ECONNREFUSED")],
  ])("is unavailable on %s", async (_name, response) => {
    const { client } = clientAnswering(response());

    expect(await client.listReports()).toEqual({ kind: "unavailable" });
  });
});

describe("downloading a report", () => {
  it("asks for the file by its URL-encoded name and reads its rows", async () => {
    const { client, fetch } = clientAnswering(
      answer(200, settlementReportCsv({ rows: [SALE_ROW] })),
    );

    const result = await client.downloadReport("purosur settlement/2026.csv");

    expect(sentRequest(fetch)).toMatchObject({
      url: `${BASE}/purosur%20settlement%2F2026.csv`,
      method: "GET",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    expect(result).toMatchObject({
      kind: "downloaded",
      rows: [{ sourceId: "1000000001", grossAmount: 310_900 }],
    });
  });

  it("is unavailable and logs no content when the file cannot be read", async () => {
    const csv = settlementReportCsv({
      rows: [
        SALE_ROW.map((field, index) =>
          CSV_HEADER[index] === "TRANSACTION_AMOUNT" ? "oops" : field,
        ),
      ],
    });
    const { client } = clientAnswering(answer(200, csv));

    expect(await client.downloadReport(REPORT_FILE_NAME)).toEqual({ kind: "unavailable" });
    expect(consoleCalls).toHaveLength(1);
    expect(JSON.stringify(consoleCalls)).not.toContain("1000000001");
  });

  it.each([
    ["not found", () => answer(404, { message: "not found" })],
    ["a server error", () => answer(500, "")],
    ["no connection", () => new Error("connect ECONNREFUSED")],
  ])("is unavailable on %s", async (_name, response) => {
    const { client } = clientAnswering(response());

    expect(await client.downloadReport(REPORT_FILE_NAME)).toEqual({ kind: "unavailable" });
  });
});
