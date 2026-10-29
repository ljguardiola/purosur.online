import {
  netContentQuantitySchema,
  type ProductCreationBody,
  productCreationBodySchema,
  type TagSummary,
} from "@purosur/contracts";
import type { NetContentUnit, SaleUnit } from "@purosur/domain";
import type { Option, Options } from "@purosur/ui";
import { type BarcodeListValue, barcodeListMessage, barcodesWithScan } from "./barcode-list";
import { categoryMessage } from "./category-path";
import { NET_CONTENT_UNIT_LABELS } from "./net-content";
import { NET_CONTENT_QUANTITY_INVALID, parseNetContentQuantity } from "./net-content-quantity";
import { schemaLimit } from "./schema-limit";

type NetContentValue = { quantity: string; unit: NetContentUnit };

// A brand is chosen through a select whose empty value stands for no brand.
export const NO_BRAND = "";

export type ProductFormValues = {
  name: string;
  categoryId: string | null;
  brandId: string;
  saleUnit: SaleUnit;
  netContent: NetContentValue;
  barcodes: BarcodeListValue;
  tagIds: string[];
};

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  categoryId: null,
  brandId: NO_BRAND,
  saleUnit: "UNIT",
  netContent: { quantity: "", unit: "G" },
  barcodes: { codes: [], scan: "" },
  tagIds: [],
};

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

const nameSchema = productCreationBodySchema.shape.name;

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

export const NET_CONTENT_UNIT_OPTIONS: Options<Option<NetContentUnit>> = [
  { value: "G", label: NET_CONTENT_UNIT_LABELS.G },
  { value: "KG", label: NET_CONTENT_UNIT_LABELS.KG },
  { value: "ML", label: NET_CONTENT_UNIT_LABELS.ML },
  { value: "L", label: NET_CONTENT_UNIT_LABELS.L },
  { value: "UNIT", label: NET_CONTENT_UNIT_LABELS.UNIT },
];

export const PRODUCT_BRAND_INACTIVE_ERROR =
  "La marca elegida se dio de baja. Elegí otra o dejala sin marca.";

export function tagInactiveError(tags: TagSummary[], tagId: string): string {
  const tag = tags.find((candidate) => candidate.id === tagId);
  return tag
    ? `"${tag.name}" se dio de baja. Quitalo para guardar.`
    : "Un distintivo elegido se dio de baja. Quitalo para guardar.";
}
