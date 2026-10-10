import {
  type PurchaseRegistrationBody,
  type PurchaseSummary,
  purchaseListSchema,
  purchaseSummarySchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type FetchPurchasesOutcome = CloudReadOutcome<PurchaseSummary[]>;

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

const LINE_REFUSALS = [
  "product_not_found",
  "product_inactive",
  "packaging_not_found",
  "packaging_inactive",
  "packaging_sale_unit_changed",
] as const;

export type PurchaseLineRefusal = (typeof LINE_REFUSALS)[number];

export type RegisterPurchaseOutcome =
  | { kind: "ok"; purchase: PurchaseSummary }
  | { kind: "validation_failed"; field: string; lineIndex?: number }
  | { kind: "supplier_not_found" }
  | { kind: "supplier_inactive" }
  | { kind: "line_refused"; reason: PurchaseLineRefusal; lineIndex: number }
  | RequestRefusal;

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

type RefusalBody = { code?: unknown; details?: unknown };

async function readRefusalBody(response: Response): Promise<RefusalBody> {
  const body: unknown = await response.json().catch(() => undefined);
  return typeof body === "object" && body !== null ? body : {};
}

function lineIndexOf({ details }: RefusalBody): number | undefined {
  const lineIndex = Array.isArray(details)
    ? (details[0] as { lineIndex?: unknown } | undefined)?.lineIndex
    : undefined;
  return typeof lineIndex === "number" ? lineIndex : undefined;
}

function isLineRefusal(code: unknown): code is PurchaseLineRefusal {
  return LINE_REFUSALS.some((reason) => reason === code);
}

export async function fetchPurchases(): Promise<FetchPurchasesOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/purchases");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = purchaseListSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

async function refusedRegistration(response: Response): Promise<RegisterPurchaseOutcome> {
  const body = await readRefusalBody(response.clone());
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    if (field === undefined) {
      return { kind: "failed" };
    }
    const lineIndex = lineIndexOf(body);
    return lineIndex === undefined
      ? { kind: "validation_failed", field }
      : { kind: "validation_failed", field, lineIndex };
  }
  if (response.status === 404 && body.code === "supplier_not_found") {
    return { kind: "supplier_not_found" };
  }
  if (response.status === 409 && body.code === "supplier_inactive") {
    return { kind: "supplier_inactive" };
  }
  const lineIndex = lineIndexOf(body);
  if ((response.status === 404 || response.status === 409) && isLineRefusal(body.code)) {
    return lineIndex === undefined
      ? { kind: "failed" }
      : { kind: "line_refused", reason: body.code, lineIndex };
  }
  return refusal(response);
}

export async function registerPurchase(
  input: PurchaseRegistrationBody,
): Promise<RegisterPurchaseOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = purchaseSummarySchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", purchase: parsed.data } : { kind: "failed" };
  }
  return refusedRegistration(response);
}
