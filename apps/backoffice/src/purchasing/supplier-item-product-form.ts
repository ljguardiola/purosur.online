import {
  type SupplierPriceListRowProductCreationBody,
  supplierPriceListRowProductCreationBodySchema,
} from "@purosur/contracts";
import {
  EMPTY_PRODUCT_FORM,
  PRODUCT_FIELDS,
  PRODUCT_MESSAGES,
  type ProductFormValues,
  productRequestFrom,
} from "../platform/product-form";
import { schemaLimit } from "../platform/schema-limit";
import { parseStockQuantity, quantityMessage } from "../platform/stock-quantity";
import type { SupplierPriceListRow } from "./supplier-price-lists-api";

export type SupplierItemProductFormValues = ProductFormValues & {
  packagingName: string | null;
  quantity: string;
  vatRate: string;
  version: number;
};

export const SUPPLIER_ITEM_PRODUCT_FIELDS = {
  ...PRODUCT_FIELDS,
  packagingName: "packagingName",
  quantityPerPackage: "quantity",
  vatRate: "vatRate",
  version: null,
} as const;

const packagingNameSchema = supplierPriceListRowProductCreationBodySchema.shape.packagingName;

export const EMPTY_SUPPLIER_ITEM_PRODUCT_FORM: SupplierItemProductFormValues = {
  ...EMPTY_PRODUCT_FORM,
  packagingName: "",
  quantity: "",
  vatRate: "",
  version: 1,
};

export const SUPPLIER_ITEM_PRODUCT_CATEGORY_NOT_LEAF_ERROR =
  "La categoría elegida tiene subcategorías. Elegí una de ellas.";

export function supplierItemProductFormValuesOf(
  row: SupplierPriceListRow,
  version: number,
): SupplierItemProductFormValues {
  return {
    ...EMPTY_SUPPLIER_ITEM_PRODUCT_FORM,
    name: row.description,
    packagingName: row.presentation === null ? "" : null,
    barcodes: { codes: row.barcode === null ? [] : [row.barcode], scan: "" },
    version,
  };
}

export function supplierItemProductRequestFrom(
  values: SupplierItemProductFormValues,
  requiresVatRate: boolean,
): SupplierPriceListRowProductCreationBody {
  return {
    ...productRequestFrom(values),
    version: values.version,
    packagingName: values.packagingName?.trim() ?? null,
    quantityPerPackage: parseStockQuantity(values.quantity, values.saleUnit) ?? Number.NaN,
    vatRate: requiresVatRate ? Number(values.vatRate) : null,
  };
}

function packagingNameMessage({ packagingName }: SupplierItemProductFormValues): string {
  const trimmed = packagingName?.trim() ?? "";
  if (trimmed === "") {
    return "Ingresá el nombre de la presentación.";
  }
  if (!packagingNameSchema.safeParse(trimmed).success) {
    return `El nombre puede tener hasta ${schemaLimit(packagingNameSchema.meta()?.["maxLength"])} caracteres.`;
  }
  return "Revisá el nombre de la presentación.";
}

export const SUPPLIER_ITEM_PRODUCT_MESSAGES = {
  ...PRODUCT_MESSAGES,
  packagingName: packagingNameMessage,
  quantity: ({ quantity, saleUnit }: SupplierItemProductFormValues) =>
    quantity.trim() === "" ? "Ingresá la cantidad por presentación." : quantityMessage(saleUnit),
  vatRate: () => "Elegí el IVA del ítem.",
};
