import {
  type StockAdjustmentBody,
  type StockBalanceList,
  type StockCountBody,
  type StockCountList,
  type StockCountResult,
  type StockExpectedBalance,
  type StockLossBody,
  type StockMovementList,
  type StockMovementResult,
  type StockPeriodDays,
  stockBalanceListSchema,
  stockCountListSchema,
  stockCountResultSchema,
  stockExpectedBalanceSchema,
  stockMovementListSchema,
  stockMovementResultSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";
import { readValidationFailedField } from "../platform/validation-failed-field";

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

type CloudRefusal =
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function refusalOf(response: Response): CloudRefusal {
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  return { kind: "failed" };
}

async function parsedBody<T>(response: Response, schema: Schema<T>): Promise<T | undefined> {
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? parsed.data : undefined;
}

async function read<T>(
  path: string,
  schema: Schema<T>,
): Promise<CloudReadOutcome<T> | { kind: "not_found" }> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (!response.ok) {
    return refusalOf(response);
  }
  const value = await parsedBody(response, schema);
  return value === undefined ? { kind: "failed" } : { kind: "ok", value };
}

async function readList<T>(path: string, schema: Schema<T>): Promise<CloudReadOutcome<T>> {
  const outcome = await read(path, schema);
  return outcome.kind === "not_found" ? { kind: "failed" } : outcome;
}

export function fetchStockBalances(): Promise<CloudReadOutcome<StockBalanceList>> {
  return readList("/stock/balances", stockBalanceListSchema);
}

export function fetchStockCounts(days: StockPeriodDays): Promise<CloudReadOutcome<StockCountList>> {
  return readList(`/stock/counts?days=${days}`, stockCountListSchema);
}

export function fetchStockMovements(
  days: StockPeriodDays,
): Promise<CloudReadOutcome<StockMovementList>> {
  return readList(`/stock/movements?days=${days}`, stockMovementListSchema);
}

export type FetchExpectedBalanceOutcome =
  | CloudReadOutcome<StockExpectedBalance>
  | { kind: "not_found" };

export function fetchExpectedBalance(
  productId: string,
  at: string,
): Promise<FetchExpectedBalanceOutcome> {
  const query = new URLSearchParams({ at });
  return read(
    `/stock/products/${productId}/expected-balance?${query.toString()}`,
    stockExpectedBalanceSchema,
  );
}

type WriteOutcome<T, Refusal> =
  | { kind: "ok"; value: T }
  | { kind: "validation_failed"; field: string }
  | { kind: "not_found" }
  | Refusal
  | CloudRefusal;

async function post<T, Refusal extends { kind: string }>(
  path: string,
  body: unknown,
  schema: Schema<T>,
  refusals: readonly Refusal["kind"][] = [],
): Promise<WriteOutcome<T, Refusal>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const value = await parsedBody(response, schema);
    return value === undefined ? { kind: "failed" } : { kind: "ok", value };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 400 || response.status === 409) {
    const field = await readValidationFailedField(response.clone());
    if (field !== undefined) {
      return { kind: "validation_failed", field };
    }
    const code = ((await response.json().catch(() => undefined)) as { code?: unknown } | undefined)
      ?.code;
    const refusal = refusals.find((kind) => kind === code);
    return refusal === undefined ? { kind: "failed" } : ({ kind: refusal } as Refusal);
  }
  return refusalOf(response);
}

export type RecordMovementOutcome = WriteOutcome<StockMovementResult, never>;

export function recordLoss(body: StockLossBody): Promise<RecordMovementOutcome> {
  return post("/stock/losses", body, stockMovementResultSchema);
}

export function recordAdjustment(body: StockAdjustmentBody): Promise<RecordMovementOutcome> {
  return post("/stock/adjustments", body, stockMovementResultSchema);
}

export type RegisterCountOutcome = WriteOutcome<
  StockCountResult,
  { kind: "occurred_in_the_future" } | { kind: "count_at_same_moment" }
>;

export function registerCount(body: StockCountBody): Promise<RegisterCountOutcome> {
  return post("/stock/counts", body, stockCountResultSchema, [
    "occurred_in_the_future",
    "count_at_same_moment",
  ]);
}
