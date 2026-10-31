import {
  type SupplierItemQuantityProposalBody,
  type SupplierPriceListRowProductCreationBody,
  supplierItemQuantityProposalBodySchema,
} from "@purosur/contracts";
import {
  EMPTY_PRODUCT_FORM,
  PRODUCT_FIELDS,
  PRODUCT_MESSAGES,
  type ProductFormValues,
  productRequestFrom,
} from "../platform/product-form";
import {
  type SupplierItemQuantityUnit,
  supplierItemQuantityMessage,
  supplierItemQuantityOf,
} from "./supplier-item-quantity";
import type { SupplierPriceListRow } from "./supplier-price-lists-api";

export type SupplierItemProductFormValues = ProductFormValues & {
  quantity: string;
  quantityUnit: SupplierItemQuantityUnit;
  vatRate: string;
  version: number;
};

export const SUPPLIER_ITEM_PRODUCT_FIELDS = {
  ...PRODUCT_FIELDS,
  quantity: "quantity",
  quantityUnit: null,
  vatRate: "vatRate",
  version: null,
} as const;

export const EMPTY_SUPPLIER_ITEM_PRODUCT_FORM: SupplierItemProductFormValues = {
  ...EMPTY_PRODUCT_FORM,
  quantity: "",
  quantityUnit: "KG",
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
    quantity: supplierItemQuantityOf(values),
    vatRate: requiresVatRate ? Number(values.vatRate) : null,
  };
}

export const SUPPLIER_ITEM_PRODUCT_MESSAGES = {
  ...PRODUCT_MESSAGES,
  quantity: supplierItemQuantityMessage,
  vatRate: () => "Elegí el IVA del ítem.",
};

// Null while the net content typed is not valid, so nothing is asked about a product that is not shaped yet.
export function supplierItemQuantityProposalRequestFrom(
  values: SupplierItemProductFormValues,
): SupplierItemQuantityProposalBody | null {
  const { saleUnit, netContent } = productRequestFrom(values);
  const parsed = supplierItemQuantityProposalBodySchema.safeParse({ saleUnit, netContent });
  return parsed.success ? parsed.data : null;
}
