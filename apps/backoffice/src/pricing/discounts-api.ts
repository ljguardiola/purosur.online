import {
  type DiscountCreationBody,
  type DiscountEditBody,
  type DiscountList,
  type DiscountSummary,
  type DiscountTargets,
  discountListSchema,
  discountSummarySchema,
  discountTargetsSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type FetchDiscountsOutcome = CloudReadOutcome<DiscountList>;

export type FetchDiscountTargetsOutcome = CloudReadOutcome<DiscountTargets>;

type TargetRefusal = { kind: "target_not_found" } | { kind: "target_not_sold_by_unit" };

function targetRefusal(code: string | undefined): TargetRefusal | { kind: "failed" } {
  switch (code) {
    case "discount_target_not_found":
      return { kind: "target_not_found" };
    case "discount_target_not_sold_by_unit":
      return { kind: "target_not_sold_by_unit" };
    default:
      return { kind: "failed" };
  }
}

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CreateDiscountOutcome =
  | { kind: "ok"; discount: DiscountSummary }
  | { kind: "validation_failed"; field: string }
  | TargetRefusal
  | RequestRefusal;

export type EditDiscountOutcome =
  | { kind: "ok"; discount: DiscountSummary }
  | { kind: "validation_failed"; field: string }
  | TargetRefusal
  | { kind: "product_sold_by_weight"; productName: string }
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

async function readBody(
  response: Response,
): Promise<{ code?: string; productName?: unknown } | undefined> {
  return (await response.json().catch(() => undefined)) as
    | { code?: string; productName?: unknown }
    | undefined;
}

async function readCode(response: Response): Promise<string | undefined> {
  return (await readBody(response))?.code;
}

function refusal(response: Response): RequestRefusal {
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
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

export async function fetchDiscountTargets(): Promise<FetchDiscountTargetsOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/discount-targets");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = discountTargetsSchema.safeParse(await response.json().catch(() => undefined));
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
    return targetRefusal(await readCode(response));
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
    const body = await readBody(response);
    if (body?.code === "stale_version") {
      return { kind: "stale_version" };
    }
    if (body?.code === "discount_product_sold_by_weight") {
      return typeof body.productName === "string"
        ? { kind: "product_sold_by_weight", productName: body.productName }
        : { kind: "failed" };
    }
    return targetRefusal(body?.code);
  }
  return refusal(response);
}
