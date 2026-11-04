import {
  type PurchaseOrderReceiptBody,
  type PurchaseOrderReceiptDraft,
  purchaseOrderReceiptDraftSchema,
  purchaseOrderReceiptSchema,
} from "@purosur/contracts";
import type { z } from "zod";
import { cloudFetch } from "../platform/cloud-fetch";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { type RegisterPurchaseOutcome, refusedRegistration } from "./purchases-api";

type PurchaseOrderReceipt = z.output<typeof purchaseOrderReceiptSchema>;

export type PurchaseOrderReceiptDraftRead =
  | { kind: "found"; draft: PurchaseOrderReceiptDraft }
  | { kind: "not_found" }
  | { kind: "not_receivable" };

export type FetchPurchaseOrderReceiptDraftOutcome = CloudReadOutcome<PurchaseOrderReceiptDraftRead>;

export type ReceivePurchaseOrderOutcome =
  | { kind: "ok"; receipt: PurchaseOrderReceipt }
  | Exclude<RegisterPurchaseOutcome, { kind: "ok" }>
  | { kind: "not_found" }
  | { kind: "not_receivable" }
  | { kind: "nothing_ordered_received" };

async function codeOf(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => undefined);
  return typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;
}

export async function fetchPurchaseOrderReceiptDraft(
  orderId: string,
): Promise<FetchPurchaseOrderReceiptDraftOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/purchase-orders/${orderId}/receipt-draft`);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "ok", value: { kind: "not_found" } };
  }
  if (response.status === 409) {
    return (await codeOf(response)) === "purchase_order_not_receivable"
      ? { kind: "ok", value: { kind: "not_receivable" } }
      : { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const parsed = purchaseOrderReceiptDraftSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  return parsed.success
    ? { kind: "ok", value: { kind: "found", draft: parsed.data } }
    : { kind: "failed" };
}

export async function receivePurchaseOrder(
  orderId: string,
  input: PurchaseOrderReceiptBody,
): Promise<ReceivePurchaseOrderOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/purchase-orders/${orderId}/receipts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = purchaseOrderReceiptSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success ? { kind: "ok", receipt: parsed.data } : { kind: "failed" };
  }
  const code = await codeOf(response.clone());
  if (response.status === 404 && code === "purchase_order_not_found") {
    return { kind: "not_found" };
  }
  if (response.status === 409 && code === "purchase_order_not_receivable") {
    return { kind: "not_receivable" };
  }
  if (response.status === 409 && code === "nothing_ordered_received") {
    return { kind: "nothing_ordered_received" };
  }
  return refusedRegistration(response);
}
