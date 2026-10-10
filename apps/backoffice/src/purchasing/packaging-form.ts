import {
  type PackagingCreationBody,
  type PackagingEditBody,
  type PackagingList,
  type PackagingSummary,
  packagingCreationBodySchema,
} from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { sortedItems, textOrder } from "@purosur/ui";
import { schemaLimit } from "../platform/schema-limit";
import {
  formatStockQuantityInput,
  parseStockQuantity,
  quantityMessage,
} from "../platform/stock-quantity";

const nameSchema = packagingCreationBodySchema.shape.name;

export type PackagingFormValues = {
  productId: string | null;
  name: string;
  quantity: string;
  version: number;
};

export const EMPTY_PACKAGING_FORM: PackagingFormValues = {
  productId: null,
  name: "",
  quantity: "",
  version: 1,
};

export const PACKAGING_CREATION_FIELDS = {
  productId: "productId",
  name: "name",
  quantityPerPackage: "quantity",
} as const;

export const PACKAGING_EDIT_FIELDS = {
  name: "name",
  quantityPerPackage: "quantity",
  version: null,
} as const;

export const PACKAGING_PRODUCT_REQUIRED = "Elegí el producto.";
export const PACKAGING_PRODUCT_NOT_FOUND = "Este producto ya no está disponible. Elegí otro.";
export const PACKAGING_NAME_TAKEN = "Este producto ya tiene una presentación con ese nombre.";

export function packagingNameMessage({ name }: PackagingFormValues): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre de la presentación.";
  }
  if (!nameSchema.safeParse(trimmed).success) {
    return `El nombre puede tener hasta ${schemaLimit(nameSchema.meta()?.["maxLength"])} caracteres.`;
  }
  return "Revisá el nombre de la presentación.";
}

export function packagingQuantityMessage(
  { quantity }: PackagingFormValues,
  saleUnit: SaleUnit,
): string {
  return quantity.trim() === ""
    ? "Ingresá la cantidad por presentación."
    : quantityMessage(saleUnit);
}

const productNameOrder = textOrder((product: PackagingList["products"][number]) => product.name);

export function packagingProductOptions(
  products: PackagingList["products"],
): [{ value: string; label: string }, ...{ value: string; label: string }[]] | undefined {
  const [first, ...rest] = sortedItems(products, {
    order: productNameOrder,
    direction: "ascending",
  }).map((product) => ({ value: product.id, label: product.name }));
  return first && [first, ...rest];
}

function quantityPerPackageOf({ quantity }: PackagingFormValues, saleUnit: SaleUnit): number {
  return parseStockQuantity(quantity, saleUnit) ?? Number.NaN;
}

export function packagingCreationRequestFrom(
  values: PackagingFormValues,
  saleUnit: SaleUnit,
): PackagingCreationBody {
  return {
    productId: values.productId ?? "",
    name: values.name.trim(),
    quantityPerPackage: quantityPerPackageOf(values, saleUnit),
  };
}

export function packagingEditRequestFrom(
  values: PackagingFormValues,
  saleUnit: SaleUnit,
): PackagingEditBody {
  return {
    name: values.name.trim(),
    quantityPerPackage: quantityPerPackageOf(values, saleUnit),
    version: values.version,
  };
}

export function packagingFormValuesOf(packaging: PackagingSummary): PackagingFormValues {
  return {
    productId: packaging.productId,
    name: packaging.name,
    quantity: packaging.saleUnitChanged
      ? ""
      : formatStockQuantityInput(packaging.quantityPerPackage, packaging.saleUnit),
    version: packaging.version,
  };
}
