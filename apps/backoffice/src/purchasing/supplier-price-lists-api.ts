import {
  type SupplierPriceListConfirmationBody,
  type SupplierPriceListDiscardBody,
  type SupplierPriceListReview,
  type SupplierPriceListRowPriceBody,
  type SupplierPriceListRowRemovalBody,
  type SupplierPriceListSummary,
  type SupplierPriceListUploadQuery,
  supplierPriceListListSchema,
  supplierPriceListReviewSchema,
  supplierPriceListUploadedSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readCloudJson } from "../platform/read-cloud-json";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type SupplierPriceListRow = SupplierPriceListReview["rows"][number];

export type SupplierPriceListReviewList = SupplierPriceListReview["list"];

export type FetchSupplierPriceListsOutcome = CloudReadOutcome<SupplierPriceListSummary[]>;

export type SupplierPriceListReviewRead =
  | { kind: "found"; review: SupplierPriceListReview }
  | { kind: "not_found" };

export type FetchSupplierPriceListReviewOutcome = CloudReadOutcome<SupplierPriceListReviewRead>;

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type UploadSupplierPriceListOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "supplier_not_found" }
  | { kind: "supplier_inactive" }
  | { kind: "daily_cap_reached"; cap: number }
  | { kind: "file_too_large" }
  | { kind: "not_a_pdf" }
  | { kind: "reading_unavailable" }
  | RequestRefusal;

type ReviewChangeRefusal =
  | { kind: "validation_failed"; field: string }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "stale_version" }
  | RequestRefusal;

export type ChangeSupplierPriceListRowOutcome = { kind: "ok" } | ReviewChangeRefusal;

export type ConfirmSupplierPriceListOutcome =
  | { kind: "ok" }
  | { kind: "no_rows" }
  | { kind: "unpriced_rows" }
  | { kind: "list_date_missing" }
  | { kind: "vat_missing" }
  | ReviewChangeRefusal;

export type DiscardSupplierPriceListOutcome = { kind: "ok" } | ReviewChangeRefusal;

const REVIEW_CONFLICTS = ["not_editable", "stale_version"] as const;
const CONFIRMATION_CONFLICTS = [
  "no_rows",
  "unpriced_rows",
  "list_date_missing",
  "vat_missing",
] as const;

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

async function readBody(response: Response): Promise<{ code?: unknown; cap?: unknown }> {
  const body: unknown = await response.json().catch(() => undefined);
  return typeof body === "object" && body !== null ? body : {};
}

async function validationFailed(
  response: Response,
): Promise<{ kind: "validation_failed"; field: string } | { kind: "failed" }> {
  const field = await readValidationFailedField(response);
  return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
}

export function fetchSupplierPriceLists(): Promise<FetchSupplierPriceListsOutcome> {
  return readCloudJson("/api/supplier-price-lists", supplierPriceListListSchema);
}

export async function fetchSupplierPriceListReview(
  id: string,
): Promise<FetchSupplierPriceListReviewOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/supplier-price-lists/${id}`);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "ok", value: { kind: "not_found" } };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = supplierPriceListReviewSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  return parsed.success
    ? { kind: "ok", value: { kind: "found", review: parsed.data } }
    : { kind: "failed" };
}

export async function uploadSupplierPriceList(
  query: SupplierPriceListUploadQuery,
  file: Blob,
): Promise<UploadSupplierPriceListOutcome> {
  const search = new URLSearchParams({ supplierId: query.supplierId, fileName: query.fileName });
  let response: Response;
  try {
    response = await fetch(`/api/supplier-price-lists?${search}`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const uploaded = supplierPriceListUploadedSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return uploaded.success ? { kind: "ok" } : { kind: "failed" };
  }
  if (response.status === 400) {
    return validationFailed(response);
  }
  if (response.status === 404) {
    return { kind: "supplier_not_found" };
  }
  if (response.status === 409) {
    const { code, cap } = await readBody(response);
    if (code === "supplier_inactive") {
      return { kind: "supplier_inactive" };
    }
    return code === "daily_cap_reached" && typeof cap === "number"
      ? { kind: "daily_cap_reached", cap }
      : { kind: "failed" };
  }
  if (response.status === 413) {
    return { kind: "file_too_large" };
  }
  if (response.status === 415) {
    return { kind: "not_a_pdf" };
  }
  if (response.status === 503) {
    return { kind: "reading_unavailable" };
  }
  return refusal(response);
}

async function changeReview<Conflict extends string>(
  method: "PUT" | "POST" | "DELETE",
  path: string,
  body: unknown,
  conflicts: readonly Conflict[],
): Promise<{ kind: "ok" } | { kind: Conflict } | ReviewChangeRefusal> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    return validationFailed(response);
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const { code } = await readBody(response);
    const conflict = conflicts.find((known) => known === code);
    return conflict === undefined ? { kind: "failed" } : { kind: conflict };
  }
  return refusal(response);
}

export function setSupplierPriceListRowPrice(
  listId: string,
  rowId: string,
  input: SupplierPriceListRowPriceBody,
): Promise<ChangeSupplierPriceListRowOutcome> {
  const body: SupplierPriceListRowPriceBody = {
    priceCents: input.priceCents,
    version: input.version,
  };
  return changeReview(
    "PUT",
    `/api/supplier-price-lists/${listId}/rows/${rowId}/price`,
    body,
    REVIEW_CONFLICTS,
  );
}

export function removeSupplierPriceListRow(
  listId: string,
  rowId: string,
  input: SupplierPriceListRowRemovalBody,
): Promise<ChangeSupplierPriceListRowOutcome> {
  const body: SupplierPriceListRowRemovalBody = { version: input.version };
  return changeReview(
    "DELETE",
    `/api/supplier-price-lists/${listId}/rows/${rowId}`,
    body,
    REVIEW_CONFLICTS,
  );
}

export function confirmSupplierPriceList(
  listId: string,
  input: SupplierPriceListConfirmationBody,
): Promise<ConfirmSupplierPriceListOutcome> {
  const body: SupplierPriceListConfirmationBody = {
    version: input.version,
    listDate: input.listDate,
    pricesIncludeVat: input.pricesIncludeVat,
  };
  return changeReview("POST", `/api/supplier-price-lists/${listId}/confirmation`, body, [
    ...REVIEW_CONFLICTS,
    ...CONFIRMATION_CONFLICTS,
  ]);
}

export function discardSupplierPriceList(
  listId: string,
  input: SupplierPriceListDiscardBody,
): Promise<DiscardSupplierPriceListOutcome> {
  const body: SupplierPriceListDiscardBody = { version: input.version };
  return changeReview(
    "POST",
    `/api/supplier-price-lists/${listId}/discard`,
    body,
    REVIEW_CONFLICTS,
  );
}
