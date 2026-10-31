import {
  type CategorySummary,
  type ProductCreationBody,
  type ProductSummary,
  productEditBarcodesSchema,
} from "@purosur/contracts";
import { plural } from "@purosur/ui";
import {
  barcodeListMessageOf,
  barcodeProblemMessageOf,
  barcodeTakenError,
} from "../platform/barcode-list";
import { formatNetContentQuantity } from "../platform/net-content-quantity";
import {
  EMPTY_PRODUCT_FORM,
  NO_BRAND,
  PRODUCT_FIELDS,
  PRODUCT_MESSAGES,
  type ProductFormValues,
  productRequestFrom,
} from "../platform/product-form";

export type ProductEditFormValues = ProductFormValues & { version: number };

export function productFormValues(product: ProductSummary): ProductEditFormValues {
  return {
    name: product.name,
    categoryId: product.categoryId,
    brandId: product.brandId ?? NO_BRAND,
    saleUnit: product.saleUnit,
    netContent: product.netContent
      ? {
          quantity: formatNetContentQuantity(product.netContent.quantity),
          unit: product.netContent.unit,
        }
      : EMPTY_PRODUCT_FORM.netContent,
    barcodes: { codes: product.barcodes, scan: "" },
    tagIds: product.tagIds,
    version: product.version,
  };
}

export function productEditRequestFrom(
  values: ProductEditFormValues,
): ProductCreationBody & { version: number } {
  return { ...productRequestFrom(values), version: values.version };
}

export const PRODUCT_EDIT_FIELDS = { ...PRODUCT_FIELDS, version: null } as const;

export function editedProductBarcodeProblemMessage(codes: string[]): string | undefined {
  return barcodeProblemMessageOf(productEditBarcodesSchema, codes);
}

export const PRODUCT_EDIT_MESSAGES = {
  ...PRODUCT_MESSAGES,
  barcodes: ({ barcodes }: ProductFormValues) =>
    barcodeListMessageOf(barcodes, editedProductBarcodeProblemMessage),
};

// Only reachable by a race: the category gains a subcategory of its own between loading this
// form and submitting it.
export const PRODUCT_CATEGORY_NOT_LEAF_ERROR = (params: { category: string }) =>
  `"${params.category}" tiene subcategorías. Elegí una de ellas.`;

export function categoryNameOf(categories: CategorySummary[], id: string): string {
  return categories.find((category) => category.id === id)?.name ?? "";
}

export const PRODUCT_INTERNAL_BARCODE_ON_PRODUCT_WITH_BARCODES_ERROR =
  "Un código interno solo se puede agregar a un producto sin códigos de barras.";

export function saleUnitHeldByDiscountError(discountName: string): string {
  return `No se puede vender por peso mientras la promoción "${discountName}" no esté desactivada o terminada.`;
}

export function saleUnitHeldByPackagingError(packagingName: string): string {
  return `No se puede cambiar la unidad de venta mientras la presentación de compra "${packagingName}" esté activa.`;
}

export const saleUnitHeldBySupplierItemError =
  "No se puede cambiar la unidad de venta mientras un ítem de proveedor esté vinculado al producto.";

function reactivationBarcodeTakenAdvice(codes: string[]): string {
  if (codes.length === 0) {
    return "Revisá los códigos de este producto y volvé a intentarlo.";
  }
  return plural(codes.length, {
    one: "Cambiá ese código en este producto o desactivá el producto que lo usa, y volvé a intentarlo.",
    other:
      "Cambiá esos códigos en este producto o desactivá los productos que los usan, y volvé a intentarlo.",
  });
}

export function reactivationBarcodeTakenError(codes: string[]): string {
  return `${barcodeTakenError(codes)} ${reactivationBarcodeTakenAdvice(codes)}`;
}
