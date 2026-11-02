import {
  type PurchaseOrderBuildBody,
  type PurchaseOrderDetail,
  type PurchaseOrderEditBody,
  type PurchaseOrderListQuery,
  type PurchaseOrderSummary,
  purchaseOrderBuildResponseSchema,
  purchaseOrderDetailSchema,
  purchaseOrderListSchema,
} from "@purosur/contracts";
import { cloudFetch } from "../platform/cloud-fetch";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readCloudJson } from "../platform/read-cloud-json";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type PurchaseOrderStateFilter = NonNullable<PurchaseOrderListQuery["state"]> | "ALL";

export type FetchPurchaseOrdersOutcome = CloudReadOutcome<PurchaseOrderSummary[]>;

export type PurchaseOrderRead =
  | { kind: "found"; order: PurchaseOrderDetail }
  | { kind: "not_found" };

export type FetchPurchaseOrderOutcome = CloudReadOutcome<PurchaseOrderRead>;

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

type ValidationFailed = { kind: "validation_failed"; field: string };

const BUILD_REFUSALS = [
  "supplier_not_purchasable",
  "product_not_purchasable",
  "offer_unavailable",
] as const;

export type BuildPurchaseOrdersRefusal = (typeof BUILD_REFUSALS)[number];

export type BuildPurchaseOrdersOutcome =
  | { kind: "ok"; orderIds: string[] }
  | { kind: "refused"; reason: BuildPurchaseOrdersRefusal }
  | ValidationFailed
  | RequestRefusal;

export type EditPurchaseOrderLinesOutcome =
  | { kind: "ok"; order: PurchaseOrderDetail }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "product_not_purchasable" }
  | ValidationFailed
  | RequestRefusal;

export type CancelPurchaseOrderOutcome =
  | { kind: "ok"; order: PurchaseOrderDetail }
  | { kind: "not_found" }
  | { kind: "not_cancellable" }
  | RequestRefusal;

export type SharePurchaseOrderOutcome =
  | { kind: "ok"; order: PurchaseOrderDetail }
  | { kind: "not_found" }
  | { kind: "not_shareable" }
  | RequestRefusal;

export type FetchPurchaseOrderPdfOutcome =
  | { kind: "ok"; blob: Blob }
  | { kind: "not_found" }
  | { kind: "not_shareable" }
  | RequestRefusal;

export type PurchaseOrderTextRead =
  | { kind: "found"; text: string }
  | { kind: "not_found" }
  | { kind: "not_shareable" };

export type FetchPurchaseOrderTextOutcome = CloudReadOutcome<PurchaseOrderTextRead>;

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

async function codeOf(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => undefined);
  return typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;
}

async function validationFailed(response: Response): Promise<ValidationFailed | RequestRefusal> {
  const field = await readValidationFailedField(response);
  return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
}

async function send(path: string, init: RequestInit): Promise<Response | undefined> {
  try {
    return await cloudFetch(path, init);
  } catch {
    return undefined;
  }
}

async function readOrder(response: Response): Promise<PurchaseOrderDetail | undefined> {
  const parsed = purchaseOrderDetailSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? parsed.data : undefined;
}

export function fetchPurchaseOrders(
  state: PurchaseOrderStateFilter,
): Promise<FetchPurchaseOrdersOutcome> {
  const path = state === "ALL" ? "/api/purchase-orders" : `/api/purchase-orders?state=${state}`;
  return readCloudJson(path, purchaseOrderListSchema);
}

export async function fetchPurchaseOrder(id: string): Promise<FetchPurchaseOrderOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/purchase-orders/${id}`);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "ok", value: { kind: "not_found" } };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const order = await readOrder(response);
  return order ? { kind: "ok", value: { kind: "found", order } } : { kind: "failed" };
}

export async function buildPurchaseOrders(
  input: PurchaseOrderBuildBody,
): Promise<BuildPurchaseOrdersOutcome> {
  const body: PurchaseOrderBuildBody = { choices: input.choices };
  const response = await send("/api/purchase-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    const built = purchaseOrderBuildResponseSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return built.success ? { kind: "ok", orderIds: built.data.orderIds } : { kind: "failed" };
  }
  if (response.status === 400) {
    return validationFailed(response);
  }
  if (response.status === 409) {
    const code = await codeOf(response);
    const reason = BUILD_REFUSALS.find((candidate) => candidate === code);
    return reason === undefined ? { kind: "failed" } : { kind: "refused", reason };
  }
  return refusal(response);
}

export async function editPurchaseOrderLines(
  orderId: string,
  input: PurchaseOrderEditBody,
): Promise<EditPurchaseOrderLinesOutcome> {
  const body: PurchaseOrderEditBody = { lines: input.lines };
  const response = await send(`/api/purchase-orders/${orderId}/lines`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    const order = await readOrder(response);
    return order ? { kind: "ok", order } : { kind: "failed" };
  }
  if (response.status === 400) {
    return validationFailed(response);
  }
  const code = await codeOf(response.clone());
  if (response.status === 404 && code === "purchase_order_not_found") {
    return { kind: "not_found" };
  }
  if (response.status === 409 && code === "purchase_order_not_editable") {
    return { kind: "not_editable" };
  }
  if (response.status === 409 && code === "product_not_purchasable") {
    return { kind: "product_not_purchasable" };
  }
  return refusal(response);
}

export async function cancelPurchaseOrder(orderId: string): Promise<CancelPurchaseOrderOutcome> {
  const response = await send(`/api/purchase-orders/${orderId}/cancel`, { method: "POST" });
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    const order = await readOrder(response);
    return order ? { kind: "ok", order } : { kind: "failed" };
  }
  const code = await codeOf(response.clone());
  if (response.status === 404 && code === "purchase_order_not_found") {
    return { kind: "not_found" };
  }
  if (response.status === 409 && code === "purchase_order_not_cancellable") {
    return { kind: "not_cancellable" };
  }
  return refusal(response);
}

export async function sharePurchaseOrder(orderId: string): Promise<SharePurchaseOrderOutcome> {
  const response = await send(`/api/purchase-orders/${orderId}/share`, { method: "POST" });
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    const order = await readOrder(response);
    return order ? { kind: "ok", order } : { kind: "failed" };
  }
  const code = await codeOf(response.clone());
  if (response.status === 404 && code === "purchase_order_not_found") {
    return { kind: "not_found" };
  }
  if (response.status === 409 && code === "purchase_order_not_shareable") {
    return { kind: "not_shareable" };
  }
  return refusal(response);
}

async function documentNotShareable(response: Response): Promise<boolean> {
  return (
    response.status === 409 &&
    (await codeOf(response.clone())) === "purchase_order_document_not_shareable"
  );
}

export async function fetchPurchaseOrderPdf(
  orderId: string,
): Promise<FetchPurchaseOrderPdfOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/purchase-orders/${orderId}/document.pdf`);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (await documentNotShareable(response)) {
    return { kind: "not_shareable" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const blob = await response.blob().catch(() => undefined);
  return blob === undefined ? { kind: "failed" } : { kind: "ok", blob };
}

export async function fetchPurchaseOrderText(
  orderId: string,
): Promise<FetchPurchaseOrderTextOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/purchase-orders/${orderId}/document.txt`);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "ok", value: { kind: "not_found" } };
  }
  if (await documentNotShareable(response)) {
    return { kind: "ok", value: { kind: "not_shareable" } };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const text = await response.text().catch(() => undefined);
  return text === undefined ? { kind: "failed" } : { kind: "ok", value: { kind: "found", text } };
}
