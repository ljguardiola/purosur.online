import {
  type LabelPrintsBody,
  type LabelSheetBody,
  type ListedProduct,
  type PrinterLabelSize,
  type ProductCreationBody,
  type ProductEditBody,
  type ProductSummary,
  printerLabelsSchema,
  productListSchema,
  productSummarySchema,
} from "@purosur/contracts";
import type { NetContentUnit } from "@purosur/domain";
import { cloudFetch } from "../platform/cloud-fetch";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";
import type { LabelToPrint } from "./label-printer-print-sequence";

export type ProductSaleUnit = "UNIT" | "KG";

type NetContent = { quantity: number; unit: NetContentUnit };

export type ProductStatusFilter = "active" | "inactive" | "all";

export type FetchProductsOutcome = CloudReadOutcome<ListedProduct[]>;

export type CreateProductInput = {
  name: string;
  categoryId: string;
  brandId: string | null;
  saleUnit: ProductSaleUnit;
  barcodes: string[];
  tagIds: string[];
  netContent: NetContent | null;
  coverageDays: number;
};

export type CreateProductOutcome =
  | { kind: "ok"; product: ProductSummary }
  | { kind: "validation_failed"; field: string }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "category_not_leaf" }
  | { kind: "brand_inactive" }
  | { kind: "tag_inactive"; tagId: string }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type EditProductInput = {
  name: string;
  categoryId: string;
  brandId: string | null;
  saleUnit: ProductSaleUnit;
  barcodes: string[];
  tagIds: string[];
  netContent: NetContent | null;
  coverageDays: number;
  version: number;
};

export type EditProductOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "category_not_leaf" }
  | { kind: "brand_inactive" }
  | { kind: "tag_inactive"; tagId: string }
  | { kind: "sale_unit_held_by_discount"; discountName: string }
  | { kind: "sale_unit_held_by_supplier_item" }
  | { kind: "internal_barcode_on_product_with_barcodes" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function sendJson(method: "POST" | "PUT", path: string, body: unknown): Promise<Response> {
  return cloudFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postJson(path: string, body: unknown): Promise<Response> {
  return sendJson("POST", path, body);
}

async function readBarcodeTakenCodes(response: Response): Promise<string[]> {
  const body = (await response.json().catch(() => undefined)) as { codes?: unknown } | undefined;
  return Array.isArray(body?.codes)
    ? body.codes.filter((code): code is string => typeof code === "string")
    : [];
}

export async function fetchProducts(
  status: ProductStatusFilter = "active",
): Promise<FetchProductsOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/products?status=${status}`);
  } catch {
    return { kind: "failed" };
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
  const parsed = productListSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: parsed.data };
}

export async function createProduct(input: CreateProductInput): Promise<CreateProductOutcome> {
  const requestBody: ProductCreationBody = {
    name: input.name,
    categoryId: input.categoryId,
    brandId: input.brandId,
    saleUnit: input.saleUnit,
    barcodes: input.barcodes,
    tagIds: input.tagIds,
    netContent: input.netContent,
    coverageDays: input.coverageDays,
  };
  let response: Response;
  try {
    response = await postJson("/api/products", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = productSummarySchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", product: parsed.data } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 409) {
    const cloned = response.clone();
    const body = (await cloned.json().catch(() => undefined)) as
      | { code?: string; tagId?: unknown }
      | undefined;
    if (body?.code === "category_not_leaf") {
      return { kind: "category_not_leaf" };
    }
    if (body?.code === "brand_inactive") {
      return { kind: "brand_inactive" };
    }
    if (body?.code === "tag_inactive") {
      return typeof body.tagId === "string"
        ? { kind: "tag_inactive", tagId: body.tagId }
        : { kind: "failed" };
    }
    if (body?.code === "barcode_taken") {
      return { kind: "barcode_taken", codes: await readBarcodeTakenCodes(response) };
    }
    return { kind: "failed" };
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
  return { kind: "failed" };
}

export type PrintLabelEntry = LabelSheetBody["labels"][number];

export type PrintLabelsOutcome =
  | { kind: "ok"; blob: Blob }
  | { kind: "product_not_found" }
  | { kind: "product_without_internal_barcode" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

async function refusedPrintOutcome(
  response: Response,
): Promise<Exclude<PrintLabelsOutcome, { kind: "ok" }>> {
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    if (body?.code === "product_not_found") {
      return { kind: "product_not_found" };
    }
    if (body?.code === "product_without_internal_barcode") {
      return { kind: "product_without_internal_barcode" };
    }
    return { kind: "failed" };
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
  return { kind: "failed" };
}

export async function printLabels(labels: PrintLabelEntry[]): Promise<PrintLabelsOutcome> {
  const requestBody: LabelSheetBody = { labels };
  let response: Response;
  try {
    response = await postJson("/api/label-sheets", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const blob = await response.blob().catch(() => undefined);
    if (!blob) {
      return { kind: "failed" };
    }
    return { kind: "ok", blob };
  }
  return refusedPrintOutcome(response);
}

export type FetchPrinterLabelsOutcome =
  | { kind: "ok"; labels: LabelToPrint[] }
  | { kind: "validation_failed"; field: string }
  | Exclude<PrintLabelsOutcome, { kind: "ok" }>;

function decodedRaster(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export async function fetchPrinterLabels(
  labels: PrintLabelEntry[],
  size: PrinterLabelSize,
): Promise<FetchPrinterLabelsOutcome> {
  const requestBody: LabelPrintsBody = { labels, size };
  let response: Response;
  try {
    response = await postJson("/api/label-prints", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = printerLabelsSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      return { kind: "failed" };
    }
    const { widthDots, heightDots, labels: prepared } = parsed.data;
    return {
      kind: "ok",
      labels: prepared.map((label) => ({
        copies: label.copies,
        raster: { widthDots, heightRows: heightDots, data: decodedRaster(label.rows) },
      })),
    };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response.clone());
    if (field !== undefined) {
      return { kind: "validation_failed", field };
    }
  }
  return refusedPrintOutcome(response);
}

export async function editProduct(
  id: string,
  input: EditProductInput,
): Promise<EditProductOutcome> {
  const requestBody: ProductEditBody = {
    name: input.name,
    categoryId: input.categoryId,
    brandId: input.brandId,
    saleUnit: input.saleUnit,
    barcodes: input.barcodes,
    tagIds: input.tagIds,
    netContent: input.netContent,
    coverageDays: input.coverageDays,
    version: input.version,
  };
  let response: Response;
  try {
    response = await sendJson("PUT", `/api/products/${id}`, requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const body = (await response.json().catch(() => undefined)) as
      | {
          code?: string;
          codes?: unknown;
          tagId?: unknown;
          discountName?: unknown;
        }
      | undefined;
    if (body?.code === "stale_version") {
      return { kind: "stale_version" };
    }
    if (body?.code === "category_not_leaf") {
      return { kind: "category_not_leaf" };
    }
    if (body?.code === "brand_inactive") {
      return { kind: "brand_inactive" };
    }
    if (body?.code === "tag_inactive") {
      return typeof body.tagId === "string"
        ? { kind: "tag_inactive", tagId: body.tagId }
        : { kind: "failed" };
    }
    if (body?.code === "internal_barcode_on_product_with_barcodes") {
      return { kind: "internal_barcode_on_product_with_barcodes" };
    }
    if (body?.code === "sale_unit_held_by_discount") {
      return typeof body.discountName === "string"
        ? { kind: "sale_unit_held_by_discount", discountName: body.discountName }
        : { kind: "failed" };
    }
    if (body?.code === "sale_unit_held_by_supplier_item") {
      return { kind: "sale_unit_held_by_supplier_item" };
    }
    if (body?.code === "barcode_taken") {
      const codes = Array.isArray(body.codes)
        ? body.codes.filter((code): code is string => typeof code === "string")
        : [];
      return { kind: "barcode_taken", codes };
    }
    return { kind: "failed" };
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
  return { kind: "failed" };
}

export type DeactivateProductOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "already_changed" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export async function deactivateProduct(id: string): Promise<DeactivateProductOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/products/${id}/deactivation`, { method: "PUT" });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = ((await response.json().catch(() => undefined)) as { code?: unknown } | undefined)
      ?.code;
    return code === "product_already_inactive" ? { kind: "already_changed" } : { kind: "failed" };
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
  return { kind: "failed" };
}

export type ReactivateProductOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "already_changed" }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export async function reactivateProduct(id: string): Promise<ReactivateProductOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/products/${id}/deactivation`, { method: "DELETE" });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = (
      (await response
        .clone()
        .json()
        .catch(() => undefined)) as { code?: unknown } | undefined
    )?.code;
    if (code === "product_already_active") {
      return { kind: "already_changed" };
    }
    if (code === "barcode_taken") {
      return { kind: "barcode_taken", codes: await readBarcodeTakenCodes(response) };
    }
    return { kind: "failed" };
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
  return { kind: "failed" };
}
