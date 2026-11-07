import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type OrderSearchRecordingReport,
  orderSearchRecordingFailure,
  orderSearchRecordingSettingsOf,
  RECORDED_ORDER_SEARCHES,
  recordMercadoPagoOrderSearches,
} from "./mercado-pago-order-search-recording.js";

const TOKEN = "TEST-1111222233-fictional-secret";
const ACCOUNT_ID = 998877665;
const NOW = new Date("2026-03-10T12:00:00.000Z");
const API = "https://api.mercadopago.com";
const USAGE =
  "usage: record-mercado-pago-order-searches --out <directory> --external-pos-id <id> --terminal-id <id>";
const TOKEN_REFUSAL =
  "MERCADOPAGO_TEST_ACCESS_TOKEN must hold the access token of a Mercado Pago test user";

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

type Responder = (call: Call, calls: Call[]) => { status: number; body: unknown } | undefined;

function json(status: number, body: unknown) {
  return { status, body };
}

function orderBody(id: string, reference: string) {
  return {
    id,
    status: "created",
    status_detail: "created",
    external_reference: reference,
    user_id: ACCOUNT_ID,
    transactions: { payments: [{ status: "created", status_detail: "ready_to_process" }] },
  };
}

function referenceOf(call: Call): string {
  return JSON.parse(call.body ?? "{}").external_reference;
}

function defaultResponder(overrides: Responder = () => undefined): Responder {
  const created = new Map<string, string>();
  return (call, calls) => {
    const override = overrides(call, calls);
    if (override !== undefined) {
      return override;
    }
    const url = new URL(call.url);
    if (call.method === "GET" && url.pathname === "/users/me") {
      return json(200, { id: ACCOUNT_ID, tags: ["test_user", "other"] });
    }
    if (call.method === "POST" && url.pathname === "/v1/orders") {
      const type = JSON.parse(call.body ?? "{}").type as string;
      const id = type === "qr" ? "ORD01QRORDER000077" : "ORD01PTORDER000088";
      created.set(referenceOf(call), id);
      return json(201, orderBody(id, referenceOf(call)));
    }
    if (call.method === "POST" && url.pathname.endsWith("/cancel")) {
      const id = url.pathname.split("/")[3] as string;
      return json(200, orderBody(id, "ref"));
    }
    if (call.method === "GET" && url.pathname === "/v1/orders") {
      const reference = url.searchParams.get("external_reference");
      if (!url.searchParams.has("begin_date")) {
        return json(400, { errors: [{ code: "missing_dates", message: "dates" }] });
      }
      if (url.searchParams.get("begin_date") === "not-a-date") {
        return json(400, { errors: [{ code: "invalid_date", message: "bad" }] });
      }
      const id = reference === null ? undefined : created.get(reference);
      return json(200, {
        data: id === undefined ? [] : [orderBody(id, reference as string)],
        paging: { total: id === undefined ? 0 : 1 },
      });
    }
    return json(500, { unexpected: call.url });
  };
}

describe("recording Mercado Pago order searches", () => {
  let outDir: string;
  let calls: Call[];
  let waits: number[];
  let logs: string[];
  let idCounter: number;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "mp-order-search-"));
    calls = [];
    waits = [];
    logs = [];
    idCounter = 0;
  });

  function run(responder: Responder = defaultResponder()) {
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const call: Call = {
        method: init?.method ?? "GET",
        url: String(input),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: init?.body as string | undefined,
      };
      calls.push(call);
      const answer = responder(call, calls) ?? json(500, null);
      const text =
        typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body ?? null);
      return new Response(text, { status: answer.status });
    }) as typeof globalThis.fetch;
    return recordMercadoPagoOrderSearches({
      outDir,
      accessToken: TOKEN,
      externalPosId: "REALPOS01",
      terminalId: "PAX_A910__REAL123",
      fetch,
      now: () => NOW,
      newId: () => `id-${++idCounter}`,
      wait: async (ms) => {
        waits.push(ms);
      },
      log: (line) => logs.push(line),
    });
  }

  function recorded(folder: "raw" | "scrubbed", name: string) {
    return JSON.parse(readFileSync(join(outDir, folder, `${name}.json`), "utf8"));
  }

  it("refuses an access token that is not of a test user and makes no other call", async () => {
    const responder = defaultResponder((call) =>
      call.url.endsWith("/users/me") ? json(200, { id: 1, tags: ["real"] }) : undefined,
    );

    await expect(run(responder)).rejects.toThrow(
      "the access token is not of a Mercado Pago test user, so no order was created",
    );
    expect(calls.map((call) => call.url)).toEqual([`${API}/users/me`]);
    expect(existsSync(join(outDir, "raw"))).toBe(false);
  });

  it("refuses when the user lookup is not answered successfully", async () => {
    const responder = defaultResponder((call) =>
      call.url.endsWith("/users/me") ? json(401, { message: "no" }) : undefined,
    );

    await expect(run(responder)).rejects.toThrow("not of a Mercado Pago test user");
    expect(calls).toHaveLength(1);
  });

  it("looks up the user, creates the QR then the Point order, searches and cancels both", async () => {
    await run();

    const summary = calls.map((call) => `${call.method} ${new URL(call.url).pathname}`);
    expect(summary).toEqual([
      "GET /users/me",
      "POST /v1/orders",
      "POST /v1/orders",
      "GET /v1/orders",
      "GET /v1/orders",
      "GET /v1/orders",
      "GET /v1/orders",
      "GET /v1/orders",
      "POST /v1/orders/ORD01QRORDER000077/cancel",
      "POST /v1/orders/ORD01PTORDER000088/cancel",
    ]);
    expect(calls[0]?.headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(calls[1]?.body ?? "{}").type).toBe("qr");
    expect(JSON.parse(calls[2]?.body ?? "{}").type).toBe("point");
  });

  it("searches each order's external reference with the dates and page size the client sends", async () => {
    await run();

    const searches = calls.filter(
      (call) => call.method === "GET" && call.url.includes("/v1/orders?"),
    );
    const [qr, point, nothing, missing, invalid] = searches.map((call) => new URL(call.url));
    expect(qr?.searchParams.get("external_reference")).toBe(referenceOf(calls[1] as Call));
    expect(point?.searchParams.get("external_reference")).toBe(referenceOf(calls[2] as Call));
    expect(nothing?.searchParams.get("external_reference")).not.toBe(
      qr?.searchParams.get("external_reference"),
    );
    expect(qr?.searchParams.get("begin_date")).toBe("2026-03-10T11:59:00.000Z");
    expect(qr?.searchParams.get("end_date")).toBe("2026-03-10T12:01:00.000Z");
    expect(qr?.searchParams.get("page_size")).toBe("50");
    expect([...(missing?.searchParams.keys() ?? [])]).toEqual(["external_reference", "page_size"]);
    expect(invalid?.searchParams.get("begin_date")).toBe("not-a-date");
    expect(invalid?.searchParams.get("end_date")).toBe("2026-03-10T12:01:00.000Z");
    expect(searches.every((call) => call.headers["Authorization"] === `Bearer ${TOKEN}`)).toBe(
      true,
    );
  });

  it("searches again after two seconds while the answer is an empty list, at most five searches", async () => {
    const responder = defaultResponder((call) => {
      const url = new URL(call.url);
      return url.pathname === "/v1/orders" &&
        call.method === "GET" &&
        url.searchParams.get("external_reference") === "id-2"
        ? json(200, { data: [] })
        : undefined;
    });

    const report = await run(responder);

    const qrSearches = calls.filter((call) => {
      const { searchParams } = new URL(call.url);
      return (
        searchParams.get("external_reference") === "id-2" &&
        searchParams.get("begin_date")?.startsWith("2026") === true
      );
    });
    expect(qrSearches).toHaveLength(5);
    expect(waits).toEqual([2000, 2000, 2000, 2000]);
    expect(report.recordings.find(({ name }) => name === "qr-order-found")).toEqual({
      name: "qr-order-found",
      status: 200,
      orders: 0,
    });
  });

  it("stops searching as soon as the order is found", async () => {
    let qrAnswers = 0;
    const responder = defaultResponder((call) => {
      const url = new URL(call.url);
      if (
        call.method === "GET" &&
        url.pathname === "/v1/orders" &&
        url.searchParams.get("external_reference") === "id-2" &&
        qrAnswers++ < 2
      ) {
        return json(200, { data: [] });
      }
      return undefined;
    });

    const report = await run(responder);

    expect(waits).toEqual([2000, 2000]);
    expect(report.recordings.find(({ name }) => name === "qr-order-found")?.orders).toBe(1);
  });

  it("does not wait when every search is answered as expected", async () => {
    await run();

    expect(waits).toEqual([]);
  });

  it("reports each recording with its status and the number of orders", async () => {
    const report = await run();

    expect(report.recordings).toEqual([
      { name: "qr-order-found", status: 200, orders: 1 },
      { name: "point-order-found", status: 200, orders: 1 },
      { name: "nothing-found", status: 200, orders: 0 },
      { name: "missing-dates", status: 400, orders: null },
      { name: "invalid-date", status: 400, orders: null },
    ]);
    expect(RECORDED_ORDER_SEARCHES).toEqual(report.recordings.map(({ name }) => name));
  });

  it("writes the raw and the scrubbed answer of each search", async () => {
    const report = await run();

    expect(recorded("raw", "qr-order-found")).toEqual({
      status: 200,
      body: {
        data: [expect.objectContaining({ id: "ORD01QRORDER000077", user_id: ACCOUNT_ID })],
        paging: { total: 1 },
      },
    });
    expect(recorded("scrubbed", "qr-order-found").body.data[0].user_id).toBe(1234567890);
    expect(recorded("scrubbed", "missing-dates")).toEqual({
      status: 400,
      body: { errors: [{ code: "missing_dates", message: "dates" }] },
    });
    expect(readFileSync(join(outDir, "raw", "nothing-found.json"), "utf8")).toBe(
      `${JSON.stringify(recorded("raw", "nothing-found"), null, 2)}\n`,
    );
    expect(report.scrubbed.map(({ file }) => file)).toEqual(
      RECORDED_ORDER_SEARCHES.map((name) => `${name}.json`),
    );
    expect(report.scrubbed[0]?.replacements).toEqual([
      { field: "id", count: 1 },
      { field: "external_reference", count: 1 },
      { field: "user_id", count: 1 },
    ]);
  });

  it("scrubs the identifiers, the point of sale, the terminal and the references the same way in every file", async () => {
    const responder = defaultResponder((call) => {
      const url = new URL(call.url);
      return call.method === "GET" && url.searchParams.get("external_reference") === "id-5"
        ? json(200, {
            data: [],
            note: "seen ORD01QRORDER000077 on REALPOS01 and PAX_A910__REAL123 for id-2 and id-4",
          })
        : undefined;
    });

    await run(responder);

    expect(recorded("scrubbed", "qr-order-found").body.data[0]).toMatchObject({
      id: "ORD000000000000001",
      external_reference: "00000000-0000-4000-8000-000000000001",
    });
    expect(recorded("scrubbed", "point-order-found").body.data[0]).toMatchObject({
      id: "ORD000000000000002",
      external_reference: "00000000-0000-4000-8000-000000000002",
    });
    expect(recorded("scrubbed", "nothing-found").body.note).toBe(
      "seen ORD000000000000001 on STORE01POS01 and FICTIONAL__SMARTPOS1 for 00000000-0000-4000-8000-000000000001 and 00000000-0000-4000-8000-000000000002",
    );
  });

  it("keeps the access token and the account id out of the scrubbed files", async () => {
    const responder = defaultResponder((call) => {
      const url = new URL(call.url);
      return call.method === "GET" && url.searchParams.get("external_reference") === "id-5"
        ? json(200, { data: [], note: `${TOKEN} belongs to ${ACCOUNT_ID}`, owner: ACCOUNT_ID })
        : undefined;
    });

    await run(responder);

    for (const name of RECORDED_ORDER_SEARCHES) {
      const text = readFileSync(join(outDir, "scrubbed", `${name}.json`), "utf8");
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(String(ACCOUNT_ID));
    }
    expect(readFileSync(join(outDir, "scrubbed", "nothing-found.json"), "utf8")).toContain(
      "FICTIONAL-ACCESS-TOKEN belongs to 1234567890",
    );
  });

  it("records a body that is not JSON as text", async () => {
    const responder = defaultResponder((call) =>
      call.method === "GET" && call.url.includes("not-a-date")
        ? json(502, "bad gateway")
        : undefined,
    );

    await run(responder);

    expect(recorded("raw", "invalid-date")).toEqual({ status: 502, body: "bad gateway" });
  });

  it("cancels the QR order first and the Point order second and logs each outcome", async () => {
    const report = await run();

    expect(report.cancellations).toEqual([
      { order: "qr", outcome: "cancelled" },
      { order: "point", outcome: "cancelled" },
    ]);
    expect(logs).toEqual([
      "record-mercado-pago-order-searches: cancelled the qr order: cancelled",
      "record-mercado-pago-order-searches: cancelled the point order: cancelled",
    ]);
  });

  it("reports an order that could not be cancelled", async () => {
    const responder = defaultResponder((call) =>
      call.url.endsWith("/ORD01PTORDER000088/cancel")
        ? json(409, { errors: [{ code: "cannot_cancel_order" }] })
        : undefined,
    );

    const report = await run(responder);

    expect(report.cancellations).toEqual([
      { order: "qr", outcome: "cancelled" },
      { order: "point", outcome: "cannot_cancel" },
    ]);
  });

  it("cancels the QR order and rethrows when the Point order is not created", async () => {
    const responder = defaultResponder((call) =>
      call.method === "POST" && call.body?.includes('"type":"point"') ? json(422, {}) : undefined,
    );

    await expect(run(responder)).rejects.toThrow(
      "Mercado Pago did not create the Point order: refused",
    );
    expect(calls.at(-1)?.url).toBe(`${API}/v1/orders/ORD01QRORDER000077/cancel`);
    expect(calls.filter((call) => call.url.includes("/v1/orders?"))).toEqual([]);
    expect(existsSync(join(outDir, "raw"))).toBe(false);
  });

  it("throws and makes no further call when the QR order is not created", async () => {
    const responder = defaultResponder((call) =>
      call.method === "POST" ? json(422, {}) : undefined,
    );

    await expect(run(responder)).rejects.toThrow(
      "Mercado Pago did not create the QR order: refused",
    );
    expect(calls).toHaveLength(2);
  });

  it("names the scrubbed answer of an order Mercado Pago refuses to create", async () => {
    const responder = defaultResponder((call) =>
      call.method === "POST"
        ? json(400, {
            errors: [
              {
                code: "property_value",
                message: `invalid external_pos_id REALPOS01 of user ${ACCOUNT_ID}`,
                details: [`external_reference id-2 for token ${TOKEN}`],
              },
            ],
          })
        : undefined,
    );

    const failure = await run(responder).catch((error: Error) => error.message);

    expect(failure).toBe(
      "Mercado Pago did not create the QR order: refused; it answered 400 " +
        JSON.stringify({
          errors: [
            {
              code: "property_value",
              message: "invalid external_pos_id STORE01POS01 of user 1234567890",
              details: [
                "external_reference 00000000-0000-4000-8000-000000000001 for token FICTIONAL-ACCESS-TOKEN",
              ],
            },
          ],
        }),
    );
  });

  it("names a refused answer that is not JSON as its scrubbed text", async () => {
    const responder = defaultResponder((call) =>
      call.method === "POST" ? json(400, "bad pos REALPOS01") : undefined,
    );

    await expect(run(responder)).rejects.toThrow(
      'Mercado Pago did not create the QR order: refused; it answered 400 "bad pos STORE01POS01"',
    );
  });

  it("cancels the created orders when a search throws", async () => {
    const responder = defaultResponder((call) => {
      if (call.method === "GET" && call.url.includes("/v1/orders?")) {
        throw new Error("network down");
      }
      return undefined;
    });

    await expect(run(responder)).rejects.toThrow("network down");
    expect(calls.filter((call) => call.url.endsWith("/cancel"))).toHaveLength(2);
    expect(existsSync(join(outDir, "raw"))).toBe(false);
  });
});

describe("the failure of an order search recording", () => {
  const healthy: OrderSearchRecordingReport = {
    recordings: [
      { name: "qr-order-found", status: 200, orders: 1 },
      { name: "point-order-found", status: 200, orders: 1 },
      { name: "nothing-found", status: 200, orders: 0 },
      { name: "missing-dates", status: 400, orders: null },
      { name: "invalid-date", status: 400, orders: null },
    ],
    cancellations: [
      { order: "qr", outcome: "cancelled" },
      { order: "point", outcome: "cancelled" },
    ],
    scrubbed: [],
  };

  function changed(name: string, change: { status?: number; orders?: number | null }) {
    return {
      ...healthy,
      recordings: healthy.recordings.map((recording) =>
        recording.name === name ? { ...recording, ...change } : recording,
      ),
    } as OrderSearchRecordingReport;
  }

  it("is undefined when every recording is as expected", () => {
    expect(orderSearchRecordingFailure(healthy)).toBeUndefined();
  });

  it("names the QR search when it did not find exactly that order", () => {
    expect(orderSearchRecordingFailure(changed("qr-order-found", { orders: 0 }))).toBe(
      "the search of the QR order's external reference did not find exactly that order; Mercado Pago answered 200 with 0 orders",
    );
    expect(
      orderSearchRecordingFailure(changed("qr-order-found", { status: 500, orders: null })),
    ).toBe(
      "the search of the QR order's external reference did not find exactly that order; Mercado Pago answered 500 with no list of orders",
    );
  });

  it("names the Point search when it did not find exactly that order", () => {
    expect(orderSearchRecordingFailure(changed("point-order-found", { orders: 2 }))).toBe(
      "the search of the Point order's external reference did not find exactly that order; Mercado Pago answered 200 with 2 orders",
    );
  });

  it("names the search of an unused reference when it did not answer an empty list", () => {
    expect(orderSearchRecordingFailure(changed("nothing-found", { orders: 1 }))).toBe(
      "the search of an unused external reference did not answer an empty list; Mercado Pago answered 200 with 1 orders",
    );
  });

  it("refuses a search without dates or with an invalid date that was accepted", () => {
    expect(orderSearchRecordingFailure(changed("missing-dates", { status: 200 }))).toBe(
      "Mercado Pago accepted a search without dates, so it recorded no error answer",
    );
    expect(orderSearchRecordingFailure(changed("invalid-date", { status: 200 }))).toBe(
      "Mercado Pago accepted a search with an invalid date, so it recorded no error answer",
    );
  });

  it("names an order that was not cancelled", () => {
    expect(
      orderSearchRecordingFailure({
        ...healthy,
        cancellations: [
          { order: "qr", outcome: "cancelled" },
          { order: "point", outcome: "unavailable" },
        ],
      }),
    ).toBe(
      "the point order was not cancelled (unavailable); cancel it from Mercado Pago before recording again",
    );
  });

  it("reports the first failing check", () => {
    expect(
      orderSearchRecordingFailure({
        ...changed("qr-order-found", { orders: 0 }),
        cancellations: [{ order: "qr", outcome: "unavailable" }],
      }),
    ).toContain("QR order's external reference");
  });
});

describe("the settings of an order search recording", () => {
  const repositoryRoot = "/work/repo";
  const env = { MERCADOPAGO_TEST_ACCESS_TOKEN: TOKEN };
  const args = ["--out", "/work/out", "--external-pos-id", "POS1", "--terminal-id", "TERM1"];

  it("is ready with the flags and the test token", () => {
    expect(orderSearchRecordingSettingsOf(args, env, repositoryRoot)).toEqual({
      kind: "ready",
      settings: {
        outDir: "/work/out",
        externalPosId: "POS1",
        terminalId: "TERM1",
        accessToken: TOKEN,
      },
    });
  });

  it("resolves a relative output directory to an absolute one", () => {
    const result = orderSearchRecordingSettingsOf(
      ["--out", "../elsewhere", "--external-pos-id", "POS1", "--terminal-id", "TERM1"],
      env,
      repositoryRoot,
    );

    expect(result).toMatchObject({
      kind: "ready",
      settings: { outDir: expect.stringMatching(/^\//) },
    });
  });

  it.each([
    ["no flags", []],
    ["a missing flag", ["--out", "/work/out", "--external-pos-id", "POS1"]],
    ["an unknown flag", [...args, "--other", "x"]],
    ["a duplicated flag", [...args, "--out", "/work/out2"]],
    [
      "a flag without a value",
      ["--out", "/work/out", "--external-pos-id", "POS1", "--terminal-id"],
    ],
  ])("answers the usage for %s", (_name, argv) => {
    expect(orderSearchRecordingSettingsOf(argv, env, repositoryRoot)).toEqual({
      kind: "refused",
      reason: USAGE,
    });
  });

  it.each([
    ["the repository root", "/work/repo"],
    ["a folder inside the repository", "/work/repo/recordings"],
    ["the repository root written with a detour", "/work/repo/sub/.."],
  ])("refuses an output directory that is %s", (_name, out) => {
    expect(
      orderSearchRecordingSettingsOf(
        ["--out", out, "--external-pos-id", "POS1", "--terminal-id", "TERM1"],
        env,
        repositoryRoot,
      ),
    ).toEqual({ kind: "refused", reason: "--out must be outside the repository" });
  });

  it("accepts a sibling folder whose name starts like the repository's", () => {
    expect(
      orderSearchRecordingSettingsOf(
        ["--out", "/work/repo-recordings", "--external-pos-id", "POS1", "--terminal-id", "TERM1"],
        env,
        repositoryRoot,
      ).kind,
    ).toBe("ready");
  });

  it.each([
    ["missing", {}],
    ["empty", { MERCADOPAGO_TEST_ACCESS_TOKEN: "" }],
  ])("refuses a test access token that is %s", (_name, tokenEnv) => {
    expect(orderSearchRecordingSettingsOf(args, tokenEnv, repositoryRoot)).toEqual({
      kind: "refused",
      reason: TOKEN_REFUSAL,
    });
  });

  it("never falls back to the access token of the application", () => {
    expect(
      orderSearchRecordingSettingsOf(
        args,
        { MERCADOPAGO_ACCESS_TOKEN: "APP-USR-real" },
        repositoryRoot,
      ),
    ).toEqual({ kind: "refused", reason: TOKEN_REFUSAL });
  });
});
