import {
  type PurchaseChange,
  type PurchaseChoices,
  type PurchaseHeaderCorrectionBody,
  type PurchaseLineExpiryCorrectionBody,
  type PurchaseLinesAdditionBody,
  type PurchaseRegistrationBody,
  type PurchaseSummary,
  purchaseChangesSchema,
  purchaseChoicesSchema,
  purchaseListSchema,
  purchaseSummarySchema,
} from "@purosur/contracts";
import { cloudFetch } from "../platform/cloud-fetch";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type FetchPurchasesOutcome = CloudReadOutcome<PurchaseSummary[]>;

export type FetchPurchaseChoicesOutcome = CloudReadOutcome<PurchaseChoices>;

export type FetchPurchaseChangesOutcome = CloudReadOutcome<PurchaseChange[]>;

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

const LINE_REFUSALS = ["product_not_found", "product_inactive"] as const;

export type PurchaseLineRefusal = (typeof LINE_REFUSALS)[number];

export type RegisterPurchaseOutcome =
  | { kind: "ok"; purchase: PurchaseSummary }
  | { kind: "validation_failed"; field: string; lineIndex?: number }
  | { kind: "supplier_not_found" }
  | { kind: "supplier_inactive" }
  | { kind: "line_refused"; reason: PurchaseLineRefusal; lineIndex: number }
  | RequestRefusal;

export type AddPurchaseLinesOutcome =
  | { kind: "ok"; purchase: PurchaseSummary }
  | { kind: "validation_failed"; field: string; lineIndex?: number }
  | { kind: "line_refused"; reason: PurchaseLineRefusal; lineIndex: number }
  | { kind: "not_found" }
  | RequestRefusal;

type PurchaseCorrectionRefusal =
  | { kind: "unchanged" }
  | { kind: "validation_failed"; field: string }
  | { kind: "not_found" }
  | RequestRefusal;

export type CorrectPurchaseHeaderOutcome =
  | { kind: "ok"; purchase: PurchaseSummary }
  | PurchaseCorrectionRefusal;

export type CorrectPurchaseLineExpiryOutcome =
  | { kind: "ok"; purchase: PurchaseSummary }
  | PurchaseCorrectionRefusal;

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
    response = await cloudFetch("/api/purchases");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = purchaseListSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export async function fetchPurchaseChoices(): Promise<FetchPurchaseChoicesOutcome> {
  let response: Response;
  try {
    response = await cloudFetch("/api/purchase-choices");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = purchaseChoicesSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

async function refusedLines(
  response: Response,
  body: RefusalBody,
): Promise<Exclude<AddPurchaseLinesOutcome, { kind: "ok" | "not_found" }>> {
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
  const lineIndex = lineIndexOf(body);
  if ((response.status === 404 || response.status === 409) && isLineRefusal(body.code)) {
    return lineIndex === undefined
      ? { kind: "failed" }
      : { kind: "line_refused", reason: body.code, lineIndex };
  }
  return refusal(response);
}

export async function refusedRegistration(
  response: Response,
): Promise<Exclude<RegisterPurchaseOutcome, { kind: "ok" }>> {
  const body = await readRefusalBody(response.clone());
  if (response.status === 404 && body.code === "supplier_not_found") {
    return { kind: "supplier_not_found" };
  }
  if (response.status === 409 && body.code === "supplier_inactive") {
    return { kind: "supplier_inactive" };
  }
  return refusedLines(response, body);
}

export async function registerPurchase(
  input: PurchaseRegistrationBody,
): Promise<RegisterPurchaseOutcome> {
  let response: Response;
  try {
    response = await cloudFetch("/api/purchases", {
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

async function sendCorrection(path: string, method: "POST" | "PATCH", body: unknown) {
  try {
    return await cloudFetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return undefined;
  }
}

async function readPurchase(response: Response): Promise<PurchaseSummary | undefined> {
  const parsed = purchaseSummarySchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? parsed.data : undefined;
}

async function refusedCorrection(
  response: Response,
  unchangedCode: "purchase_unchanged" | "expiry_unchanged",
): Promise<PurchaseCorrectionRefusal> {
  const body = await readRefusalBody(response.clone());
  if (
    response.status === 404 &&
    (body.code === "purchase_not_found" || body.code === "line_not_found")
  ) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    return body.code === unchangedCode ? { kind: "unchanged" } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  return refusal(response);
}

export async function addPurchaseLines(
  purchaseId: string,
  input: PurchaseLinesAdditionBody,
): Promise<AddPurchaseLinesOutcome> {
  const response = await sendCorrection(`/api/purchases/${purchaseId}/lines`, "POST", input);
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    const purchase = await readPurchase(response);
    return purchase ? { kind: "ok", purchase } : { kind: "failed" };
  }
  const body = await readRefusalBody(response.clone());
  if (response.status === 404 && body.code === "purchase_not_found") {
    return { kind: "not_found" };
  }
  return refusedLines(response, body);
}

export async function correctPurchaseHeader(
  purchaseId: string,
  input: PurchaseHeaderCorrectionBody,
): Promise<CorrectPurchaseHeaderOutcome> {
  const response = await sendCorrection(`/api/purchases/${purchaseId}`, "PATCH", input);
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    const purchase = await readPurchase(response);
    return purchase ? { kind: "ok", purchase } : { kind: "failed" };
  }
  return refusedCorrection(response, "purchase_unchanged");
}

export async function correctPurchaseLineExpiry(
  purchaseId: string,
  lineId: string,
  input: PurchaseLineExpiryCorrectionBody,
): Promise<CorrectPurchaseLineExpiryOutcome> {
  const response = await sendCorrection(
    `/api/purchases/${purchaseId}/lines/${lineId}/expiry`,
    "PATCH",
    input,
  );
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    const purchase = await readPurchase(response);
    return purchase ? { kind: "ok", purchase } : { kind: "failed" };
  }
  return refusedCorrection(response, "expiry_unchanged");
}

export async function fetchPurchaseChanges(
  purchaseId: string,
): Promise<FetchPurchaseChangesOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/purchases/${purchaseId}/changes`);
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = purchaseChangesSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}
