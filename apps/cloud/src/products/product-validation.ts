export type SaleUnit = "UNIT" | "KG";

// Shared by the creation route (`categoryId` in the body) and the edit route (both the `:id`
// path parameter and `categoryId` in the body), the same shape `category-edit-route.ts` uses.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProductFieldValidationFailure {
  field: "name" | "categoryId" | "saleUnit" | "barcodes" | "version";
  message: string;
}

// Mirrors `@purosur/contracts`'s product limits because this app's `tsc` build (explicit
// `rootDir`) cannot import that package's untranspiled source; the drift test below guards
// against it.
export const PRODUCT_NAME_MAX_LENGTH = 100;
export const BARCODE_MAX_LENGTH = 64;

export function productNameLength(name: string): number {
  return Array.from(name).length;
}

export function barcodeLength(code: string): number {
  return Array.from(code).length;
}

export function readProductName(body: unknown): string | undefined {
  const raw = (body as { name?: unknown } | undefined)?.name;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readCategoryId(body: unknown): string | undefined {
  const raw = (body as { categoryId?: unknown } | undefined)?.categoryId;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export function readSaleUnit(body: unknown): SaleUnit | undefined {
  const raw = (body as { saleUnit?: unknown } | undefined)?.saleUnit;
  return raw === "UNIT" || raw === "KG" ? raw : undefined;
}

/** Reads trimmed, non-blank barcodes from the request body; duplicates are left for the caller. */
export function readBarcodes(body: unknown): string[] | undefined {
  const raw = (body as { barcodes?: unknown } | undefined)?.barcodes;
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const trimmed: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      return undefined;
    }
    const trimmedEntry = entry.trim();
    if (trimmedEntry.length === 0) {
      return undefined;
    }
    trimmed.push(trimmedEntry);
  }
  return trimmed;
}

export interface ProductFieldsInput {
  name: string | undefined;
  categoryId: string | undefined;
  saleUnit: SaleUnit | undefined;
  barcodes: string[] | undefined;
}

/**
 * Validates the fields shared by product creation and edit, in the order the backoffice's form
 * fields appear: name, category, sale unit, then barcodes. Whether `categoryId` names an existing
 * category is checked separately against the database, not here.
 */
export function validateProductFields(
  input: ProductFieldsInput,
): ProductFieldValidationFailure | undefined {
  if (!input.name) {
    return { field: "name", message: "name must not be empty" };
  }
  if (productNameLength(input.name) > PRODUCT_NAME_MAX_LENGTH) {
    return {
      field: "name",
      message: `name must be at most ${PRODUCT_NAME_MAX_LENGTH} characters`,
    };
  }
  if (!input.categoryId) {
    return { field: "categoryId", message: "categoryId must be an existing category's id" };
  }
  if (!input.saleUnit) {
    return { field: "saleUnit", message: "saleUnit must be UNIT or KG" };
  }
  if (!input.barcodes) {
    return { field: "barcodes", message: "barcodes must be a non-empty list of codes" };
  }
  const seen = new Set<string>();
  for (const code of input.barcodes) {
    if (barcodeLength(code) > BARCODE_MAX_LENGTH) {
      return {
        field: "barcodes",
        message: `each barcode must be at most ${BARCODE_MAX_LENGTH} characters`,
      };
    }
    if (/\s/.test(code)) {
      return { field: "barcodes", message: "a barcode must not contain whitespace" };
    }
    if (seen.has(code)) {
      return { field: "barcodes", message: "the same barcode was sent more than once" };
    }
    seen.add(code);
  }
  return undefined;
}
