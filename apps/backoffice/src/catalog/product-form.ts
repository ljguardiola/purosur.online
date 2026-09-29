import type { ProductCreationBody, ProductSummary } from "@purosur/contracts";
import {
  BARCODE_MAX_LENGTH,
  type BarcodeListProblem,
  barcodeListProblem,
  isProductNameTooLong,
  isValidNetContentQuantity,
  type NetContentUnit,
  PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
} from "@purosur/domain";
import {
  formatNetContentQuantity,
  NET_CONTENT_QUANTITY_INVALID,
  parseNetContentQuantity,
} from "./net-content-quantity";
import type { ProductSaleUnit } from "./products-api";

export type BarcodeListValue = { codes: string[]; scan: string };

type NetContentValue = { quantity: string; unit: NetContentUnit };

// A brand is chosen through a select whose empty value stands for no brand.
export const NO_BRAND = "";

export type ProductFormValues = {
  name: string;
  categoryId: string | null;
  brandId: string;
  saleUnit: ProductSaleUnit | null;
  netContent: NetContentValue;
  barcodes: BarcodeListValue;
};

export type ProductEditFormValues = ProductFormValues & { version: number };

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  categoryId: null,
  brandId: NO_BRAND,
  saleUnit: null,
  netContent: { quantity: "", unit: "G" },
  barcodes: { codes: [], scan: "" },
};

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
    version: product.version,
  };
}

function barcodesWithScan({ codes, scan }: BarcodeListValue): string[] {
  const pending = scan.trim();
  return pending === "" ? codes : [...codes, pending];
}

function netContentFrom({ quantity, unit }: NetContentValue) {
  if (quantity.trim() === "") {
    return null;
  }
  return { quantity: parseNetContentQuantity(quantity) ?? Number.NaN, unit };
}

export type ProductRequest = Omit<ProductCreationBody, "saleUnit"> & {
  saleUnit: ProductSaleUnit | null;
};

export function productRequestFrom(values: ProductFormValues): ProductRequest {
  return {
    name: values.name,
    categoryId: values.categoryId ?? "",
    brandId: values.brandId === NO_BRAND ? null : values.brandId,
    saleUnit: values.saleUnit,
    barcodes: barcodesWithScan(values.barcodes),
    netContent: netContentFrom(values.netContent),
  };
}

export function productEditRequestFrom(
  values: ProductEditFormValues,
): ProductRequest & { version: number } {
  return { ...productRequestFrom(values), version: values.version };
}

export const PRODUCT_FIELDS = {
  name: "name",
  categoryId: "categoryId",
  brandId: "brandId",
  saleUnit: "saleUnit",
  barcodes: "barcodes",
  netContent: "netContent",
  netContentQuantity: "netContent",
} as const;

export const PRODUCT_EDIT_FIELDS = { ...PRODUCT_FIELDS, version: null } as const;

const PRODUCT_BARCODE_REQUIRED = "Escaneá al menos un código de barras.";

const BARCODE_PROBLEM_MESSAGES = {
  too_many: `El producto puede tener hasta ${PRODUCT_BARCODES_MAX_COUNT} códigos de barras.`,
  too_long: `El código de barras puede tener hasta ${BARCODE_MAX_LENGTH} caracteres.`,
  whitespace: "El código de barras no puede tener espacios.",
  repeated: "Ese código ya está en la lista.",
} satisfies Record<BarcodeListProblem, string>;

export function barcodeProblemMessage(problem: BarcodeListProblem | undefined): string | undefined {
  return problem === undefined ? undefined : BARCODE_PROBLEM_MESSAGES[problem];
}

export function productMessage({ name }: ProductFormValues): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre del producto.";
  }
  if (isProductNameTooLong(trimmed)) {
    return `El nombre puede tener hasta ${PRODUCT_NAME_MAX_LENGTH} caracteres.`;
  }
  return "Revisá el nombre del producto.";
}

export function categoryMessage({ categoryId }: ProductFormValues): string {
  return categoryId ? "Revisá la categoría." : "Elegí una categoría.";
}

export function brandMessage(): string {
  return "La marca elegida ya no existe.";
}

export function saleUnitMessage({ saleUnit }: ProductFormValues): string {
  return saleUnit ? "Revisá la unidad de venta." : "Elegí la unidad de venta.";
}

export function netContentMessage({ netContent }: ProductFormValues): string {
  const quantity = parseNetContentQuantity(netContent.quantity);
  if (
    netContent.quantity.trim() !== "" &&
    (quantity === undefined || !isValidNetContentQuantity(quantity))
  ) {
    return NET_CONTENT_QUANTITY_INVALID;
  }
  return "Revisá el contenido neto.";
}

export function barcodeListMessage({ barcodes }: ProductFormValues): string {
  const list = barcodesWithScan(barcodes);
  if (list.length === 0) {
    return PRODUCT_BARCODE_REQUIRED;
  }
  return (
    barcodeProblemMessage(barcodeListProblem(list)) ??
    "Alguno de los códigos de barras no es válido."
  );
}

export const PRODUCT_MESSAGES = {
  name: productMessage,
  categoryId: categoryMessage,
  brandId: brandMessage,
  saleUnit: saleUnitMessage,
  netContent: netContentMessage,
  barcodes: barcodeListMessage,
};
