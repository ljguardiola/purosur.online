import {
  type CategorySummary,
  type InternalBarcodeGenerationBody,
  internalBarcodeGenerationBodySchema,
  netContentQuantitySchema,
  type ProductCreationBody,
  type ProductSummary,
  productCreationBodySchema,
  productEditBarcodesSchema,
  type TagSummary,
} from "@purosur/contracts";
import type { NetContentUnit, NewProductBarcodeListProblem } from "@purosur/domain";
import { type Option, type Options, plural } from "@purosur/ui";
import { Package, Scale } from "lucide-react";
import { createElement } from "react";
import type { ZodType } from "zod";
import {
  categoriesInTreeOrder,
  categoryPathLabels,
  leafCategories,
} from "../platform/category-path";
import { failedRules } from "../platform/failed-rules";
import { NET_CONTENT_UNIT_LABELS } from "../platform/net-content";
import { schemaLimit } from "../platform/schema-limit";
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
  tagIds: string[];
};

export type ProductEditFormValues = ProductFormValues & { version: number };

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  categoryId: null,
  brandId: NO_BRAND,
  saleUnit: null,
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
    tagIds: values.tagIds,
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
  tagIds: "tagIds",
  netContent: "netContent",
  netContentQuantity: "netContent",
} as const;

export const PRODUCT_EDIT_FIELDS = { ...PRODUCT_FIELDS, version: null } as const;

const PRODUCT_BARCODE_REQUIRED = "Escaneá al menos un código de barras.";

const nameSchema = productCreationBodySchema.shape.name;
const barcodesSchema = productCreationBodySchema.shape.barcodes;

const BARCODE_PROBLEM_MESSAGES = new Map<string, string>(
  Object.entries({
    too_many: `El producto puede tener hasta ${schemaLimit(barcodesSchema.meta()?.["maxCount"])} códigos de barras.`,
    too_long: `El código de barras puede tener hasta ${schemaLimit(barcodesSchema.meta()?.["maxLength"])} caracteres.`,
    whitespace: "El código de barras no puede tener espacios.",
    repeated: "Ese código ya está en la lista.",
    several_internal: "El producto puede tener un solo código interno.",
    internal_beside_others: "El código interno tiene que ser el único del producto.",
  } satisfies Record<NewProductBarcodeListProblem, string>),
);

function barcodeProblemMessageOf(schema: ZodType, codes: string[]): string | undefined {
  const [problem] = failedRules(schema, codes);
  return problem === undefined ? undefined : BARCODE_PROBLEM_MESSAGES.get(problem);
}

export function barcodeProblemMessage(codes: string[]): string | undefined {
  return barcodeProblemMessageOf(barcodesSchema, codes);
}

export function editedProductBarcodeProblemMessage(codes: string[]): string | undefined {
  return barcodeProblemMessageOf(productEditBarcodesSchema, codes);
}

export function internalBarcodeGenerationRequestFrom(
  codes: string[],
): InternalBarcodeGenerationBody | undefined {
  return internalBarcodeGenerationBodySchema.safeParse({ barcodes: codes }).data;
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

export function categoryMessage({ categoryId }: ProductFormValues): string {
  return categoryId ? "Revisá la categoría." : "Elegí una categoría.";
}

export function brandMessage(): string {
  return "La marca elegida ya no existe.";
}

export function tagsMessage(): string {
  return "Un distintivo elegido ya no existe.";
}

export function saleUnitMessage({ saleUnit }: ProductFormValues): string {
  return saleUnit ? "Revisá la unidad de venta." : "Elegí la unidad de venta.";
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

function barcodeListMessageFrom(
  { barcodes }: ProductFormValues,
  problemMessage: (codes: string[]) => string | undefined,
): string {
  const list = barcodesWithScan(barcodes);
  if (list.length === 0) {
    return PRODUCT_BARCODE_REQUIRED;
  }
  return problemMessage(list) ?? "Alguno de los códigos de barras no es válido.";
}

export function barcodeListMessage(values: ProductFormValues): string {
  return barcodeListMessageFrom(values, barcodeProblemMessage);
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
  barcodes: (values: ProductFormValues) =>
    barcodeListMessageFrom(values, editedProductBarcodeProblemMessage),
};

// Typed by hand: inferred from lucide, an icon's optional className fails the design system's Icon
// type under exactOptionalPropertyTypes.
export const SALE_UNIT_OPTIONS = [
  {
    value: "UNIT",
    icon: createElement<{ className?: string }>(Package),
    label: "Por unidad",
    description: "Se vende de a uno",
  },
  {
    value: "KG",
    icon: createElement<{ className?: string }>(Scale),
    label: "Por peso",
    description: "Se pesa en la balanza",
  },
] as const;

export const NET_CONTENT_UNIT_OPTIONS: Options<Option<NetContentUnit>> = [
  { value: "G", label: NET_CONTENT_UNIT_LABELS.G },
  { value: "KG", label: NET_CONTENT_UNIT_LABELS.KG },
  { value: "ML", label: NET_CONTENT_UNIT_LABELS.ML },
  { value: "L", label: NET_CONTENT_UNIT_LABELS.L },
  { value: "UNIT", label: NET_CONTENT_UNIT_LABELS.UNIT },
];

// Full paths disambiguate leaves that share a name under different parents.
export function categorySelectOptions(
  categories: CategorySummary[],
): Options<Option<string>> | undefined {
  const leafIds = new Set(leafCategories(categories).map((category) => category.id));
  if (leafIds.size === 0) {
    return undefined;
  }
  const labels = categoryPathLabels(categories);
  const leaves = categoriesInTreeOrder(categories).filter((category) => leafIds.has(category.id));
  const [first, ...rest] = leaves.map((category) => ({
    value: category.id,
    label: labels.get(category.id) ?? category.name,
  }));
  if (!first) {
    throw new Error("no category to offer: leaves.length > 0 was already checked");
  }
  return [first, ...rest];
}

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

export function tagInactiveError(tags: TagSummary[], tagId: string): string {
  const tag = tags.find((candidate) => candidate.id === tagId);
  return tag
    ? `"${tag.name}" se dio de baja. Quitalo para guardar.`
    : "Un distintivo elegido se dio de baja. Quitalo para guardar.";
}

const PRODUCT_BARCODE_TAKEN_UNNAMED = "Alguno de los códigos ya es de otro producto.";

function barcodeTakenText(params: { codes: string[] }): string {
  const list = params.codes.join(", ");
  return plural(params.codes.length, {
    one: `El código ${list} ya es de otro producto.`,
    other: `Los códigos ${list} ya son de otro producto.`,
  });
}

export function barcodeTakenError(codes: string[]): string {
  return codes.length > 0 ? barcodeTakenText({ codes }) : PRODUCT_BARCODE_TAKEN_UNNAMED;
}
