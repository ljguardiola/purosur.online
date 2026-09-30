import type {
  CategorySummary,
  ProductCreationBody,
  ProductSummary,
  TagSummary,
} from "@purosur/contracts";
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
import { type Option, type Options, plural } from "@purosur/ui";
import { Package, Scale } from "lucide-react";
import { createElement } from "react";
import { categoriesInTreeOrder, categoryPathLabels, leafCategories } from "./category-path";
import { NET_CONTENT_UNIT_LABELS } from "./net-content";
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
  tagIds: tagsMessage,
  saleUnit: saleUnitMessage,
  netContent: netContentMessage,
  barcodes: barcodeListMessage,
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
