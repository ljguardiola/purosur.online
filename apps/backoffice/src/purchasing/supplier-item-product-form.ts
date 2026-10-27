import {
  type SupplierPriceListRowProductCreationBody,
  supplierPriceListRowProductCreationBodySchema,
} from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import {
  type BarcodeListValue,
  barcodeListMessage,
  barcodesWithScan,
} from "../platform/barcode-list";
import { categoryMessage } from "../platform/category-path";
import { schemaLimit } from "../platform/schema-limit";
import { parseStockQuantity, quantityMessage } from "../platform/stock-quantity";
import type { SupplierPriceListRow } from "./supplier-price-lists-api";

export type SupplierItemProductFormValues = {
  saleUnit: SaleUnit;
  packagingName: string | null;
  quantity: string;
  categoryId: string | null;
  barcodes: BarcodeListValue;
  vatRate: string;
  version: number;
};

export const SUPPLIER_ITEM_PRODUCT_FIELDS = {
  saleUnit: "saleUnit",
  packagingName: "packagingName",
  quantityPerPackage: "quantity",
  categoryId: "categoryId",
  barcodes: "barcodes",
  vatRate: "vatRate",
  version: null,
} as const;

const packagingNameSchema = supplierPriceListRowProductCreationBodySchema.shape.packagingName;

export const EMPTY_SUPPLIER_ITEM_PRODUCT_FORM: SupplierItemProductFormValues = {
  saleUnit: "UNIT",
  packagingName: "",
  quantity: "",
  categoryId: null,
  barcodes: { codes: [], scan: "" },
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
    version: values.version,
    saleUnit: values.saleUnit,
    categoryId: values.categoryId ?? "",
    barcodes: barcodesWithScan(values.barcodes),
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
  saleUnit: () => "Elegí la unidad de venta.",
  packagingName: packagingNameMessage,
  quantity: ({ quantity, saleUnit }: SupplierItemProductFormValues) =>
    quantity.trim() === "" ? "Ingresá la cantidad por presentación." : quantityMessage(saleUnit),
  categoryId: categoryMessage,
  barcodes: barcodeListMessage,
  vatRate: () => "Elegí el IVA del ítem.",
};
