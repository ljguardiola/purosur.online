import {
  BARCODE_MAX_LENGTH,
  isBarcodeTooLong,
  isProductNameTooLong,
  isValidNetContentQuantity,
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
  NET_CONTENT_UNITS,
  type NetContentUnit,
  PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
} from "@purosur/contracts";

export type SaleUnit = "UNIT" | "KG";

export interface NetContentInput {
  quantity: number;
  unit: NetContentUnit;
}

export interface ProductFieldValidationFailure {
  field:
    | "name"
    | "categoryId"
    | "saleUnit"
    | "barcodes"
    | "version"
    | "netContent"
    | "netContentQuantity";
  message: string;
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

/**
 * Reads the `netContent` object from the request body: `undefined` when the key is absent or
 * explicitly `null` (no net content, and on edit, clearing it), the literal `"invalid"` when
 * exactly one of `quantity`/`unit` is present or `unit` is not a listed one, or the parsed
 * `{ quantity, unit }` pair otherwise. `quantity`'s own bounds (positive, at most 3 decimals) are
 * checked by `validateProductFields`, the same split `readProductName` and its length limit use.
 */
export function readNetContent(body: unknown): NetContentInput | "invalid" | undefined {
  const raw = (body as { netContent?: unknown } | undefined)?.netContent;
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "object") {
    return "invalid";
  }
  const { quantity, unit } = raw as { quantity?: unknown; unit?: unknown };
  const quantityPresent = typeof quantity === "number";
  const unitPresent = typeof unit === "string" && (NET_CONTENT_UNITS as string[]).includes(unit);
  if (!quantityPresent || !unitPresent) {
    return "invalid";
  }
  return { quantity, unit: unit as NetContentUnit };
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
  netContent?: NetContentInput | "invalid" | undefined;
}

/**
 * Validates the fields shared by product creation and edit, in the order the backoffice's form
 * fields appear: name, category, sale unit, barcodes, then net content. Whether `categoryId` names
 * an existing category is checked separately against the database, not here.
 */
export function validateProductFields(
  input: ProductFieldsInput,
): ProductFieldValidationFailure | undefined {
  if (!input.name) {
    return { field: "name", message: "name must not be empty" };
  }
  if (isProductNameTooLong(input.name)) {
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
  if (input.barcodes.length > PRODUCT_BARCODES_MAX_COUNT) {
    return {
      field: "barcodes",
      message: `a product can have at most ${PRODUCT_BARCODES_MAX_COUNT} barcodes`,
    };
  }
  const seen = new Set<string>();
  for (const code of input.barcodes) {
    if (isBarcodeTooLong(code)) {
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
  if (input.netContent === "invalid") {
    return {
      field: "netContent",
      message: "netContent must be an object with a quantity and a listed unit, or absent/null",
    };
  }
  if (input.netContent && !isValidNetContentQuantity(input.netContent.quantity)) {
    return {
      field: "netContentQuantity",
      message: `netContent's quantity must be a positive number of at most ${NET_CONTENT_QUANTITY_MAX_DECIMALS} decimals, at most ${NET_CONTENT_QUANTITY_MAX}`,
    };
  }
  return undefined;
}
