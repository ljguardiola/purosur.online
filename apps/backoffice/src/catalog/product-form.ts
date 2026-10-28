import {
  type CategorySummary,
  netContentQuantitySchema,
  type ProductCreationBody,
  type ProductSummary,
  productCreationBodySchema,
  productEditBarcodesSchema,
  type TagSummary,
} from "@purosur/contracts";
import type { NetContentUnit } from "@purosur/domain";
import { type Option, type Options, plural } from "@purosur/ui";
import {
  type BarcodeListValue,
  barcodeListMessage,
  barcodeListMessageOf,
  barcodeProblemMessageOf,
  barcodesWithScan,
  barcodeTakenError,
} from "../platform/barcode-list";
import { categoryMessage } from "../platform/category-path";
import { NET_CONTENT_UNIT_LABELS } from "../platform/net-content";
import { schemaLimit } from "../platform/schema-limit";
import {
  formatNetContentQuantity,
  NET_CONTENT_QUANTITY_INVALID,
  parseNetContentQuantity,
} from "./net-content-quantity";
import type { ProductSaleUnit } from "./products-api";

type NetContentValue = { quantity: string; unit: NetContentUnit };

// A brand is chosen through a select whose empty value stands for no brand.
export const NO_BRAND = "";

export type ProductFormValues = {
  name: string;
  categoryId: string | null;
  brandId: string;
  saleUnit: ProductSaleUnit;
  netContent: NetContentValue;
  barcodes: BarcodeListValue;
  tagIds: string[];
};

export type ProductEditFormValues = ProductFormValues & { version: number };

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  categoryId: null,
  brandId: NO_BRAND,
  saleUnit: "UNIT",
  netContent: { quantity: "", unit: "G" },
  barcodes: { codes: [], scan: "" },
  tagIds: [],
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
    tagIds: product.tagIds,
    version: product.version,
  };
}

function netContentFrom({ quantity, unit }: NetContentValue) {
  if (quantity.trim() === "") {
    return null;
  }
  return { quantity: parseNetContentQuantity(quantity) ?? Number.NaN, unit };
}

export function productRequestFrom(values: ProductFormValues): ProductCreationBody {
  return {
    name: values.name,
    categoryId: values.categoryId ?? "",
    brandId: values.brandId === NO_BRAND ? null : values.brandId,
    saleUnit: values.saleUnit,
    barcodes: barcodesWithScan(values.barcodes),
    tagIds: values.tagIds,
    netContent: netContentFrom(values.netContent),
  };
}

export function productEditRequestFrom(
  values: ProductEditFormValues,
): ProductCreationBody & { version: number } {
  return { ...productRequestFrom(values), version: values.version };
}

export const PRODUCT_FIELDS = {
  name: "name",
  categoryId: "categoryId",
  brandId: "brandId",
  saleUnit: "saleUnit",
  barcodes: "barcodes",
  tagIds: "tagIds",
  netContent: "netContent",
  netContentQuantity: "netContent",
} as const;

export const PRODUCT_EDIT_FIELDS = { ...PRODUCT_FIELDS, version: null } as const;

const nameSchema = productCreationBodySchema.shape.name;

export function editedProductBarcodeProblemMessage(codes: string[]): string | undefined {
  return barcodeProblemMessageOf(productEditBarcodesSchema, codes);
}

export function productMessage({ name }: ProductFormValues): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre del producto.";
  }
  if (!nameSchema.safeParse(trimmed).success) {
    return `El nombre puede tener hasta ${schemaLimit(nameSchema.meta()?.["maxLength"])} caracteres.`;
  }
  return "Revisá el nombre del producto.";
}

export function brandMessage(): string {
  return "La marca elegida ya no existe.";
}

export function tagsMessage(): string {
  return "Un distintivo elegido ya no existe.";
}

export function saleUnitMessage(): string {
  return "Revisá la unidad de venta.";
}

export function netContentMessage({ netContent }: ProductFormValues): string {
  const quantity = parseNetContentQuantity(netContent.quantity);
  if (
    netContent.quantity.trim() !== "" &&
    (quantity === undefined || !netContentQuantitySchema.safeParse(quantity).success)
  ) {
    return NET_CONTENT_QUANTITY_INVALID;
  }
  return "Revisá el contenido neto.";
}

export const PRODUCT_MESSAGES = {
  name: productMessage,
  categoryId: categoryMessage,
  brandId: brandMessage,
  tagIds: tagsMessage,
  saleUnit: saleUnitMessage,
  netContent: netContentMessage,
  barcodes: barcodeListMessage,
};

export const PRODUCT_EDIT_MESSAGES = {
  ...PRODUCT_MESSAGES,
  barcodes: ({ barcodes }: ProductFormValues) =>
    barcodeListMessageOf(barcodes, editedProductBarcodeProblemMessage),
};

export const NET_CONTENT_UNIT_OPTIONS: Options<Option<NetContentUnit>> = [
  { value: "G", label: NET_CONTENT_UNIT_LABELS.G },
  { value: "KG", label: NET_CONTENT_UNIT_LABELS.KG },
  { value: "ML", label: NET_CONTENT_UNIT_LABELS.ML },
  { value: "L", label: NET_CONTENT_UNIT_LABELS.L },
  { value: "UNIT", label: NET_CONTENT_UNIT_LABELS.UNIT },
];

// Only reachable by a race: the category gains a subcategory of its own between loading this
// form and submitting it.
export const PRODUCT_CATEGORY_NOT_LEAF_ERROR = (params: { category: string }) =>
  `"${params.category}" tiene subcategorías. Elegí una de ellas.`;

export function categoryNameOf(categories: CategorySummary[], id: string): string {
  return categories.find((category) => category.id === id)?.name ?? "";
}

export const PRODUCT_BRAND_INACTIVE_ERROR =
  "La marca elegida se dio de baja. Elegí otra o dejala sin marca.";

export const PRODUCT_INTERNAL_BARCODE_ON_PRODUCT_WITH_BARCODES_ERROR =
  "Un código interno solo se puede agregar a un producto sin códigos de barras.";

export function saleUnitHeldByDiscountError(discountName: string): string {
  return `No se puede vender por peso mientras la promoción "${discountName}" no esté desactivada o terminada.`;
}

export function saleUnitHeldByPackagingError(packagingName: string): string {
  return `No se puede cambiar la unidad de venta mientras la presentación de compra "${packagingName}" esté activa.`;
}

export function tagInactiveError(tags: TagSummary[], tagId: string): string {
  const tag = tags.find((candidate) => candidate.id === tagId);
  return tag
    ? `"${tag.name}" se dio de baja. Quitalo para guardar.`
    : "Un distintivo elegido se dio de baja. Quitalo para guardar.";
}

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
