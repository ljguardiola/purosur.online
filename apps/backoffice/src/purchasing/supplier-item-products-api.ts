import {
  type CategorySummary,
  categoryListSchema,
  type InternalBarcodeGenerationBody,
  type SupplierPriceListRowProductCreated,
  type SupplierPriceListRowProductCreationBody,
  supplierPriceListRowProductCreatedSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import {
  type GenerateInternalBarcodeOutcome,
  requestInternalBarcode,
} from "../platform/internal-barcodes-api";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readCloudJson } from "../platform/read-cloud-json";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type FetchProductCreationCategoriesOutcome = CloudReadOutcome<CategorySummary[]>;

export type CreateProductFromSupplierItemOutcome =
  | { kind: "ok"; created: SupplierPriceListRowProductCreated }
  | { kind: "validation_failed"; field: string }
  | { kind: "barcode_taken"; codes: string[] }
  | { kind: "category_not_leaf" }
  | { kind: "already_linked" }
  | { kind: "vat_rate_missing" }
  | { kind: "vat_rate_invalid" }
  | { kind: "name_too_long" }
  | { kind: "presentation_too_long" }
  | { kind: "not_editable" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

const CONFLICTS = [
  "not_editable",
  "stale_version",
  "already_linked",
  "vat_rate_missing",
  "vat_rate_invalid",
  "category_not_leaf",
  "name_too_long",
  "presentation_too_long",
] as const;

export function fetchProductCreationCategories(): Promise<FetchProductCreationCategoriesOutcome> {
  return readCloudJson("/api/supplier-price-lists/product-categories", categoryListSchema);
}

export function generateSupplierItemInternalBarcode(
  body: InternalBarcodeGenerationBody,
): Promise<GenerateInternalBarcodeOutcome> {
  return requestInternalBarcode("/api/supplier-price-lists/internal-barcodes", body);
}

async function answerConflict(response: Response): Promise<CreateProductFromSupplierItemOutcome> {
  const body: unknown = await response.json().catch(() => undefined);
  const { code, codes } = (typeof body === "object" && body !== null ? body : {}) as {
    code?: unknown;
    codes?: unknown;
  };
  if (code === "barcode_taken") {
    return {
      kind: "barcode_taken",
      codes: Array.isArray(codes) ? codes.filter((taken) => typeof taken === "string") : [],
    };
  }
  const conflict = CONFLICTS.find((known) => known === code);
  return conflict === undefined ? { kind: "failed" } : { kind: conflict };
}

async function answer(response: Response): Promise<CreateProductFromSupplierItemOutcome> {
  if (response.ok) {
    const created = supplierPriceListRowProductCreatedSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return created.success ? { kind: "ok", created: created.data } : { kind: "failed" };
  }
  switch (response.status) {
    case 400: {
      const field = await readValidationFailedField(response);
      return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
    }
    case 401:
      return { kind: "unauthenticated" };
    case 403:
      return { kind: "forbidden" };
    case 404:
      return { kind: "not_found" };
    case 409:
      return answerConflict(response);
    case 429:
      return rateLimitOutcome(response);
    default:
      return { kind: "failed" };
  }
}

export async function createProductFromSupplierItem(
  listId: string,
  rowId: string,
  input: SupplierPriceListRowProductCreationBody,
): Promise<CreateProductFromSupplierItemOutcome> {
  const body: SupplierPriceListRowProductCreationBody = {
    version: input.version,
    saleUnit: input.saleUnit,
    categoryId: input.categoryId,
    barcodes: input.barcodes,
    packagingName: input.packagingName,
    quantityPerPackage: input.quantityPerPackage,
    vatRate: input.vatRate,
  };
  let response: Response;
  try {
    response = await fetch(`/api/supplier-price-lists/${listId}/rows/${rowId}/product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed" };
  }
  return answer(response);
}
