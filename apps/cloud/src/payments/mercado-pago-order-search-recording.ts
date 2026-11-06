import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  MercadoPagoOrderCancellation,
  MercadoPagoOrderCreation,
  MercadoPagoOrders,
} from "@purosur/domain/payments/use-cases";
import { z } from "zod";
import { createMercadoPagoOrdersClient } from "./mercado-pago-orders-client.js";
import {
  type MercadoPagoScrubReplacement,
  scrubMercadoPagoRecording,
} from "./scrub-mercado-pago-recording.js";

const userSchema = z.object({ id: z.union([z.number(), z.string()]), tags: z.array(z.string()) });
const API_URL = "https://api.mercadopago.com";
const USAGE =
  "usage: record-mercado-pago-order-searches --out <directory> --external-pos-id <id> --terminal-id <id>";
const FLAGS = ["--out", "--external-pos-id", "--terminal-id"];
const TOKEN_REFUSAL =
  "MERCADOPAGO_TEST_ACCESS_TOKEN must hold the access token of a Mercado Pago test user";
const LOG_PREFIX = "record-mercado-pago-order-searches";
const ORDER_AMOUNT_CENTS = 1000;
const ORDER_EXPIRES_AFTER_MINUTES = 10;
const SEARCH_WINDOW_MS = 60_000;
const RETRY_WAIT_MS = 2000;
const MAX_FOUND_SEARCHES = 5;
const SEARCH_PAGE_SIZE = "50";

export const RECORDED_ORDER_SEARCHES = [
  "qr-order-found",
  "point-order-found",
  "nothing-found",
  "missing-dates",
  "invalid-date",
] as const;

type RecordedOrderSearch = (typeof RECORDED_ORDER_SEARCHES)[number];
type OrderKind = "qr" | "point";

interface OrderSearchRecordingSettings {
  outDir: string;
  externalPosId: string;
  terminalId: string;
  accessToken: string;
}

export type OrderSearchRecordingSettingsResult =
  | { kind: "ready"; settings: OrderSearchRecordingSettings }
  | { kind: "refused"; reason: string };

export function orderSearchRecordingSettingsOf(
  argv: string[],
  env: Record<string, string | undefined>,
  repositoryRoot: string,
): OrderSearchRecordingSettingsResult {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index] as string;
    const value = argv[index + 1];
    if (!FLAGS.includes(flag) || !value || values.has(flag)) {
      return { kind: "refused", reason: USAGE };
    }
    values.set(flag, value);
  }
  const out = values.get("--out");
  const externalPosId = values.get("--external-pos-id");
  const terminalId = values.get("--terminal-id");
  if (!out || !externalPosId || !terminalId) {
    return { kind: "refused", reason: USAGE };
  }
  const outDir = resolve(out);
  const fromRepository = relative(resolve(repositoryRoot), outDir);
  const insideRepository = !fromRepository.startsWith("..") && !isAbsolute(fromRepository);
  if (insideRepository) {
    return { kind: "refused", reason: "--out must be outside the repository" };
  }
  const accessToken = env["MERCADOPAGO_TEST_ACCESS_TOKEN"];
  if (!accessToken) {
    return { kind: "refused", reason: TOKEN_REFUSAL };
  }
  return { kind: "ready", settings: { outDir, externalPosId, terminalId, accessToken } };
}

export interface RecordMercadoPagoOrderSearchesOptions extends OrderSearchRecordingSettings {
  fetch: typeof globalThis.fetch;
  now: () => Date;
  newId: () => string;
  wait: (ms: number) => Promise<void>;
  log: (line: string) => void;
}

export interface OrderSearchRecordingReport {
  recordings: { name: RecordedOrderSearch; status: number; orders: number | null }[];
  cancellations: {
    order: OrderKind;
    outcome: MercadoPagoOrderCancellation["kind"];
  }[];
  scrubbed: { file: string; replacements: MercadoPagoScrubReplacement[] }[];
}

function ordersOf(body: unknown): number | null {
  if (typeof body !== "object" || body === null || !("data" in body)) {
    return null;
  }
  return Array.isArray(body.data) ? body.data.length : null;
}

function answeredTail(status: number, orders: number | null): string {
  return `Mercado Pago answered ${status} with ${orders ?? "no list of"} orders`;
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

export function orderSearchRecordingFailure({
  recordings,
  cancellations,
}: OrderSearchRecordingReport): string | undefined {
  const recording = (name: RecordedOrderSearch) =>
    recordings.find((candidate) => candidate.name === name);
  for (const [name, label] of [
    ["qr-order-found", "QR"],
    ["point-order-found", "Point"],
  ] as const) {
    const found = recording(name);
    if (found !== undefined && (!isSuccess(found.status) || found.orders !== 1)) {
      return `the search of the ${label} order's external reference did not find exactly that order; ${answeredTail(found.status, found.orders)}`;
    }
  }
  const nothing = recording("nothing-found");
  if (nothing !== undefined && (!isSuccess(nothing.status) || nothing.orders !== 0)) {
    return `the search of an unused external reference did not answer an empty list; ${answeredTail(nothing.status, nothing.orders)}`;
  }
  const missingDates = recording("missing-dates");
  if (missingDates !== undefined && isSuccess(missingDates.status)) {
    return "Mercado Pago accepted a search without dates, so it recorded no error answer";
  }
  const invalidDate = recording("invalid-date");
  if (invalidDate !== undefined && isSuccess(invalidDate.status)) {
    return "Mercado Pago accepted a search with an invalid date, so it recorded no error answer";
  }
  const notCancelled = cancellations.find(({ outcome }) => outcome !== "cancelled");
  if (notCancelled !== undefined) {
    return `the ${notCancelled.order} order was not cancelled (${notCancelled.outcome}); cancel it from Mercado Pago before recording again`;
  }
  return undefined;
}

interface RecordedAnswer {
  status: number;
  body: unknown;
}

async function readUser(options: RecordMercadoPagoOrderSearchesOptions) {
  const response = await options.fetch(`${API_URL}/users/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${options.accessToken}` },
  });
  const body: unknown = await response.json().catch(() => null);
  const user = userSchema.safeParse(body);
  if (!isSuccess(response.status) || !user.success || !user.data.tags.includes("test_user")) {
    throw new Error("the access token is not of a Mercado Pago test user, so no order was created");
  }
  return { accountId: String(user.data.id) };
}

async function search(
  options: RecordMercadoPagoOrderSearchesOptions,
  query: Record<string, string>,
): Promise<RecordedAnswer> {
  const response = await options.fetch(`${API_URL}/v1/orders?${new URLSearchParams(query)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${options.accessToken}` },
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

function createdOrderOf(kind: OrderKind, creation: MercadoPagoOrderCreation): string {
  if (creation.kind !== "created") {
    throw new Error(
      `Mercado Pago did not create the ${kind === "qr" ? "QR" : "Point"} order: ${creation.kind}`,
    );
  }
  return creation.orderId;
}

async function cancelCreated(
  client: MercadoPagoOrders,
  options: RecordMercadoPagoOrderSearchesOptions,
  created: { order: OrderKind; orderId: string }[],
): Promise<OrderSearchRecordingReport["cancellations"]> {
  const cancellations: OrderSearchRecordingReport["cancellations"] = [];
  for (const { order, orderId } of created) {
    const answer = await client.cancelOrder(orderId, options.newId());
    cancellations.push({ order, outcome: answer.kind });
    options.log(`${LOG_PREFIX}: cancelled the ${order} order: ${answer.kind}`);
  }
  return cancellations;
}

export async function recordMercadoPagoOrderSearches(
  options: RecordMercadoPagoOrderSearchesOptions,
): Promise<OrderSearchRecordingReport> {
  const { accountId } = await readUser(options);
  const client = createMercadoPagoOrdersClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
  });
  const createdFrom = new Date(options.now().getTime() - SEARCH_WINDOW_MS);
  const created: { order: OrderKind; orderId: string }[] = [];
  let answers: [RecordedOrderSearch, RecordedAnswer][] = [];
  let cancellations: OrderSearchRecordingReport["cancellations"] = [];
  try {
    const qrKey = options.newId();
    const qrReference = options.newId();
    created.push({
      order: "qr",
      orderId: createdOrderOf(
        "qr",
        await client.createQrOrder({
          idempotencyKey: qrKey,
          externalReference: qrReference,
          amount: ORDER_AMOUNT_CENTS,
          expiresAfterMinutes: ORDER_EXPIRES_AFTER_MINUTES,
          externalPosId: options.externalPosId,
        }),
      ),
    });
    const pointKey = options.newId();
    const pointReference = options.newId();
    created.push({
      order: "point",
      orderId: createdOrderOf(
        "point",
        await client.createPointOrder({
          idempotencyKey: pointKey,
          externalReference: pointReference,
          amount: ORDER_AMOUNT_CENTS,
          expiresAfterMinutes: ORDER_EXPIRES_AFTER_MINUTES,
          terminalId: options.terminalId,
          cardType: "DEBIT",
        }),
      ),
    });

    const datedSearch = (externalReference: string) =>
      search(options, {
        external_reference: externalReference,
        begin_date: createdFrom.toISOString(),
        end_date: new Date(options.now().getTime() + SEARCH_WINDOW_MS).toISOString(),
        page_size: SEARCH_PAGE_SIZE,
      });
    const searchUntilFound = async (externalReference: string) => {
      let answer = await datedSearch(externalReference);
      for (
        let searches = 1;
        searches < MAX_FOUND_SEARCHES && isSuccess(answer.status) && ordersOf(answer.body) === 0;
        searches += 1
      ) {
        await options.wait(RETRY_WAIT_MS);
        answer = await datedSearch(externalReference);
      }
      return answer;
    };

    answers = [
      ["qr-order-found", await searchUntilFound(qrReference)],
      ["point-order-found", await searchUntilFound(pointReference)],
      ["nothing-found", await datedSearch(options.newId())],
      [
        "missing-dates",
        await search(options, { external_reference: qrReference, page_size: SEARCH_PAGE_SIZE }),
      ],
      [
        "invalid-date",
        await search(options, {
          external_reference: qrReference,
          begin_date: "not-a-date",
          end_date: new Date(options.now().getTime() + SEARCH_WINDOW_MS).toISOString(),
          page_size: SEARCH_PAGE_SIZE,
        }),
      ],
    ];
  } finally {
    cancellations = await cancelCreated(client, options, created);
  }

  await mkdir(join(options.outDir, "raw"), { recursive: true });
  await mkdir(join(options.outDir, "scrubbed"), { recursive: true });
  const secrets = { accessToken: options.accessToken, accountId };
  const scrubbed: OrderSearchRecordingReport["scrubbed"] = [];
  for (const [name, answer] of answers) {
    const file = `${name}.json`;
    const result = scrubMercadoPagoRecording(answer, secrets);
    await writeFile(join(options.outDir, "raw", file), `${JSON.stringify(answer, null, 2)}\n`);
    await writeFile(
      join(options.outDir, "scrubbed", file),
      `${JSON.stringify(result.value, null, 2)}\n`,
    );
    scrubbed.push({ file, replacements: result.replacements });
  }
  return {
    recordings: answers.map(([name, answer]) => ({
      name,
      status: answer.status,
      orders: ordersOf(answer.body),
    })),
    cancellations,
    scrubbed,
  };
}
