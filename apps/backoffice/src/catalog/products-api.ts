import {
  internalBarcodeSchema,
  type LabelSheetBody,
  type ProductCreationBody,
  type ProductEditBody,
  type ProductSummary,
  productListSchema,
  productSummarySchema,
} from "@purosur/contracts";
import type { NetContentUnit } from "@purosur/domain";
import { retryAfterSeconds } from "../platform/retry-after-seconds";

export type ProductSaleUnit = "UNIT" | "KG";

export type NetContent = { quantity: number; unit: NetContentUnit };

export type ProductStatusFilter = "active" | "inactive" | "all";

export type FetchProductsOutcome =
  | { kind: "ok"; value: ProductSummary[] }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

type ProductFieldError =
  | "name"
  | "categoryId"
  | "saleUnit"
  | "barcodes"
  | "version"
  | "netContent"
  | "netContentQuantity";

export type CreateProductInput = {
  name: string;
  categoryId: string;
  saleUnit: ProductSaleUnit;
  barcodes: string[];
  netContent: NetContent | null;
};

export type CreateProductOutcome =
  | { kind: "ok"; value: ProductSummary }
  | { kind: "validation_failed"; field: ProductFieldError }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "category_not_leaf" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type EditProductInput = {
  name: string;
  categoryId: string;
  saleUnit: ProductSaleUnit;
  barcodes: string[];
  netContent: NetContent | null;
  version: number;
};

export type EditProductOutcome =
  | { kind: "ok"; value: ProductSummary }
  | { kind: "validation_failed"; field: ProductFieldError }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "category_not_leaf" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type GenerateInternalBarcodeOutcome =
  | { kind: "ok"; code: string }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function productFieldFromWire(field: unknown): ProductFieldError | undefined {
  return field === "name" ||
    field === "categoryId" ||
    field === "saleUnit" ||
    field === "barcodes" ||
    field === "version" ||
    field === "netContent" ||
    field === "netContentQuantity"
    ? field
    : undefined;
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
    response = await fetch(`/products?status=${status}`);
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
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
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
    saleUnit: input.saleUnit,
    barcodes: input.barcodes,
    netContent: input.netContent,
  };
  let response: Response;
  try {
    response = await postJson("/products", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = productSummarySchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: parsed.data };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed") {
      const field = productFieldFromWire(body.details?.[0]?.field);
      if (field) {
        return { kind: "validation_failed", field };
      }
    }
    return { kind: "failed" };
  }
  if (response.status === 409) {
    const cloned = response.clone();
    const body = (await cloned.json().catch(() => undefined)) as { code?: string } | undefined;
    if (body?.code === "category_not_leaf") {
      return { kind: "category_not_leaf" };
    }
    return { kind: "barcode_taken", codes: await readBarcodeTakenCodes(response) };
  }
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

export async function generateInternalBarcode(): Promise<GenerateInternalBarcodeOutcome> {
  let response: Response;
  try {
    response = await postJson("/products/internal-barcode");
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = internalBarcodeSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      return { kind: "failed" };
    }
    return { kind: "ok", code: parsed.data.code };
  }
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

export type PrintLabelEntry = LabelSheetBody["labels"][number];

export type PrintLabelsOutcome =
  | { kind: "ok"; blob: Blob }
  | { kind: "product_not_found" }
  | { kind: "product_without_internal_barcode" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export async function printLabels(labels: PrintLabelEntry[]): Promise<PrintLabelsOutcome> {
  const requestBody: LabelSheetBody = { labels };
  let response: Response;
  try {
    response = await postJson("/products/labels", requestBody);
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
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  return { kind: "failed" };
}

export async function editProduct(
  id: string,
  input: EditProductInput,
): Promise<EditProductOutcome> {
  const requestBody: ProductEditBody = {
    name: input.name,
    categoryId: input.categoryId,
    saleUnit: input.saleUnit,
    barcodes: input.barcodes,
    netContent: input.netContent,
    version: input.version,
  };
  let response: Response;
  try {
    response = await postJson(`/products/${id}/edit`, requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = productSummarySchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: parsed.data };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed") {
      const field = productFieldFromWire(body.details?.[0]?.field);
      if (field) {
        return { kind: "validation_failed", field };
      }
    }
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; codes?: unknown }
      | undefined;
    if (body?.code === "stale_version") {
      return { kind: "stale_version" };
    }
    if (body?.code === "category_not_leaf") {
      return { kind: "category_not_leaf" };
    }
    const codes = Array.isArray(body?.codes)
      ? body.codes.filter((code): code is string => typeof code === "string")
      : [];
    return { kind: "barcode_taken", codes };
  }
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

export type DeactivateProductOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

/** The cloud answers the same `not_found` for a malformed, missing, or already-inactive target. */
export async function deactivateProduct(id: string): Promise<DeactivateProductOutcome> {
  let response: Response;
  try {
    response = await postJson(`/products/${id}/deactivation`);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
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
