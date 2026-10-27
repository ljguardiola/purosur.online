import {
  type SupplierPriceListRowProductCreationBody,
  supplierPriceListRowProductCreationBodySchema,
} from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import {
  type BarcodeListValue,
  barcodeProblemMessage,
  barcodesWithScan,
} from "../platform/barcode-list";
import { schemaLimit } from "../platform/schema-limit";
import { parseStockQuantity, quantityMessage } from "../platform/stock-quantity";
import type { SupplierPriceListRow } from "./supplier-price-lists-api";

export type SupplierItemProductFormValues = {
  name: string;
  saleUnit: SaleUnit;
  packagingName: string;
  quantity: string;
  categoryId: string | null;
  barcodes: BarcodeListValue;
  vatRate: string;
  version: number;
};

export const SUPPLIER_ITEM_PRODUCT_FIELDS = {
  name: "name",
  saleUnit: "saleUnit",
  packagingName: "packagingName",
  quantityPerPackage: "quantity",
  categoryId: "categoryId",
  barcodes: "barcodes",
  vatRate: "vatRate",
  version: null,
} as const;

const nameSchema = supplierPriceListRowProductCreationBodySchema.shape.name;
const packagingNameSchema = supplierPriceListRowProductCreationBodySchema.shape.packagingName;

export const EMPTY_SUPPLIER_ITEM_PRODUCT_FORM: SupplierItemProductFormValues = {
  name: "",
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
    name: row.description,
    packagingName: row.presentation ?? "",
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
    name: values.name.trim(),
    saleUnit: values.saleUnit,
    categoryId: values.categoryId ?? "",
    barcodes: barcodesWithScan(values.barcodes),
    packagingName: values.packagingName.trim(),
    quantityPerPackage: parseStockQuantity(values.quantity, values.saleUnit) ?? Number.NaN,
    vatRate: requiresVatRate ? Number(values.vatRate) : null,
  };
}

function nameMessageOf(
  value: string,
  schema: typeof nameSchema | typeof packagingNameSchema,
  missing: string,
  review: string,
): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    return missing;
  }
  if (!schema.safeParse(trimmed).success) {
    return `El nombre puede tener hasta ${schemaLimit(schema.meta()?.["maxLength"])} caracteres.`;
  }
  return review;
}

export const SUPPLIER_ITEM_PRODUCT_MESSAGES = {
  name: ({ name }: SupplierItemProductFormValues) =>
    nameMessageOf(
      name,
      nameSchema,
      "Ingresá el nombre del producto.",
      "Revisá el nombre del producto.",
    ),
  saleUnit: () => "Elegí la unidad de venta.",
  packagingName: ({ packagingName }: SupplierItemProductFormValues) =>
    nameMessageOf(
      packagingName,
      packagingNameSchema,
      "Ingresá el nombre de la presentación.",
      "Revisá el nombre de la presentación.",
    ),
  quantity: ({ quantity, saleUnit }: SupplierItemProductFormValues) =>
    quantity.trim() === "" ? "Ingresá la cantidad por presentación." : quantityMessage(saleUnit),
  categoryId: ({ categoryId }: SupplierItemProductFormValues) =>
    categoryId ? "Revisá la categoría." : "Elegí una categoría.",
  barcodes: ({ barcodes }: SupplierItemProductFormValues) => {
    const list = barcodesWithScan(barcodes);
    return list.length === 0
      ? "Escaneá al menos un código de barras."
      : (barcodeProblemMessage(list) ?? "Alguno de los códigos de barras no es válido.");
  },
  vatRate: () => "Elegí el IVA del ítem.",
};
