import {
  type DiscountCreationBody,
  type DiscountEditBody,
  type DiscountList,
  type DiscountSummary,
  discountListSchema,
  discountSummarySchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type FetchDiscountsOutcome = CloudReadOutcome<DiscountList>;

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CreateDiscountOutcome =
  | { kind: "ok"; discount: DiscountSummary }
  | { kind: "validation_failed"; field: string }
  | { kind: "target_not_found" }
  | RequestRefusal;

export type EditDiscountOutcome =
  | { kind: "ok"; discount: DiscountSummary }
  | { kind: "validation_failed"; field: string }
  | { kind: "target_not_found" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | RequestRefusal;

function sendJson(method: "POST" | "PUT", path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readCode(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  return body?.code;
}

function refusal(response: Response): RequestRefusal {
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

export async function fetchDiscounts(): Promise<FetchDiscountsOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/discounts");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = discountListSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export async function createDiscount(input: DiscountCreationBody): Promise<CreateDiscountOutcome> {
  let response: Response;
  try {
    response = await sendJson("POST", "/api/discounts", input);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = discountSummarySchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", discount: parsed.data } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 409) {
    return (await readCode(response)) === "discount_target_not_found"
      ? { kind: "target_not_found" }
      : { kind: "failed" };
  }
  return refusal(response);
}

export async function editDiscount(
  id: string,
  input: DiscountEditBody,
): Promise<EditDiscountOutcome> {
  let response: Response;
  try {
    response = await sendJson("PUT", `/api/discounts/${id}`, input);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = discountSummarySchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", discount: parsed.data } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = await readCode(response);
    if (code === "stale_version") {
      return { kind: "stale_version" };
    }
    return code === "discount_target_not_found" ? { kind: "target_not_found" } : { kind: "failed" };
  }
  return refusal(response);
}
