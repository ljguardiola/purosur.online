import type { CalendarDate } from "@internationalized/date";
import {
  type PackagingSummary,
  type PurchaseChoices,
  type PurchaseRegistrationBody,
  purchaseRegistrationBodySchema,
  type SupplierSummary,
} from "@purosur/contracts";
import type { ReceiptType } from "@purosur/domain";
import { parseAmountCents, parseEsArNumber, sortedItems, textOrder } from "@purosur/ui";
import { schemaLimit } from "../platform/schema-limit";
import {
  formatStockQuantity,
  parseStockQuantity,
  quantityMessage,
} from "../platform/stock-quantity";
import type { PurchaseLineRefusal } from "./purchases-api";
import { receiptLabel } from "./receipt-label";

const { receiptNumber: receiptNumberSchema, note: noteSchema } =
  purchaseRegistrationBodySchema.shape;

export type PurchaseProducts = PurchaseChoices["products"];

export type PurchaseLineValues = {
  id: number;
  productId: string | null;
  loadedBy: "packaging" | "quantity";
  packagingId: string | null;
  packages: string;
  quantity: string;
  cost: string;
  lotNumber: string;
  expiresOn: CalendarDate | null;
  reviewPriceNow: boolean;
};

export type PurchaseFormValues = {
  supplierId: string | null;
  purchasedOn: CalendarDate | null;
  receiptType: ReceiptType | null;
  receiptNumber: string;
  note: string;
  lines: PurchaseLineValues[];
};

export function emptyPurchaseLine(id: number): PurchaseLineValues {
  return {
    id,
    productId: null,
    loadedBy: "quantity",
    packagingId: null,
    packages: "",
    quantity: "",
    cost: "",
    lotNumber: "",
    expiresOn: null,
    reviewPriceNow: false,
  };
}

export function emptyPurchaseForm(today: CalendarDate | null): PurchaseFormValues {
  return {
    supplierId: null,
    purchasedOn: today,
    receiptType: null,
    receiptNumber: "",
    note: "",
    lines: [emptyPurchaseLine(1)],
  };
}

export function priceReviewProductIds(lines: readonly PurchaseLineValues[]): string[] {
  const chosen = lines.flatMap((line) =>
    line.reviewPriceNow && line.productId !== null ? [line.productId] : [],
  );
  return [...new Set(chosen)];
}

export function nextPurchaseLineId(lines: readonly PurchaseLineValues[]): number {
  return Math.max(0, ...lines.map((line) => line.id)) + 1;
}

const [firstReceiptType, ...otherReceiptTypes] =
  purchaseRegistrationBodySchema.shape.receiptType.options.map((value) => ({
    value,
    label: receiptLabel(value, null),
  }));

if (!firstReceiptType) {
  throw new Error("The contract declares no receipt type");
}

export const RECEIPT_TYPE_OPTIONS: [typeof firstReceiptType, ...(typeof firstReceiptType)[]] = [
  firstReceiptType,
  ...otherReceiptTypes,
];

export const PURCHASE_FIELDS = {
  supplierId: "supplierId",
  purchasedOn: "purchasedOn",
  receiptType: "receiptType",
  receiptNumber: "receiptNumber",
  note: "note",
  lines: "lines",
} as const;

export const PURCHASE_SUPPLIER_REQUIRED = "Elegí el proveedor.";
export const PURCHASE_SUPPLIER_NOT_FOUND = "Este proveedor ya no está disponible. Elegí otro.";
export const PURCHASE_SUPPLIER_INACTIVE = "Este proveedor ya no está activo. Elegí otro.";
export const PURCHASE_RECEIPT_TYPE_REQUIRED = "Elegí el tipo de comprobante.";

export const PURCHASE_LINE_REFUSALS = {
  product_not_found: "Este producto ya no está disponible.",
  product_inactive: "Este producto ya no está activo.",
  packaging_not_found: "Esta presentación ya no está disponible.",
  packaging_inactive: "Esta presentación ya no está activa.",
  packaging_sale_unit_changed:
    "La presentación no coincide con la unidad de venta actual del producto.",
} satisfies Record<PurchaseLineRefusal, string>;

export function purchaseDateMessage({ purchasedOn }: PurchaseFormValues): string {
  return purchasedOn === null
    ? "Ingresá la fecha de la compra."
    : "La fecha de compra no puede ser posterior a hoy.";
}

export function purchaseReceiptNumberMessage({
  receiptType,
  receiptNumber,
}: PurchaseFormValues): string {
  const trimmed = receiptNumber.trim();
  if (receiptType === "sin_comprobante" && trimmed !== "") {
    return "Una compra sin comprobante no lleva número.";
  }
  if (trimmed === "") {
    return "Ingresá el número del comprobante.";
  }
  const limit = schemaLimit(receiptNumberSchema.meta()?.["maxLength"]);
  return `El número puede tener hasta ${limit} caracteres.`;
}

export function purchaseNoteMessage(_values: PurchaseFormValues): string {
  const limit = schemaLimit(noteSchema.meta()?.["maxLength"]);
  return `La nota puede tener hasta ${limit} caracteres.`;
}

function saleUnitOf(products: PurchaseProducts, productId: string | null) {
  return products.find((product) => product.id === productId)?.saleUnit ?? "UNIT";
}

function packageCountOf(packages: string): number {
  const digits = parseEsArNumber(packages, 0);
  return digits ? Number(digits.whole) : Number.NaN;
}

function quantityOf(line: PurchaseLineValues, products: PurchaseProducts): number {
  return parseStockQuantity(line.quantity, saleUnitOf(products, line.productId)) ?? Number.NaN;
}

function lineRequestFrom(
  line: PurchaseLineValues,
  products: PurchaseProducts,
): PurchaseRegistrationBody["lines"][number] {
  const common = {
    productId: line.productId ?? "",
    costPaidCents: parseAmountCents(line.cost) ?? Number.NaN,
    lotNumber: line.lotNumber.trim(),
    expiresOn: line.expiresOn?.toString() ?? "",
  };
  return line.loadedBy === "packaging"
    ? {
        loadedBy: "packaging",
        ...common,
        packagingId: line.packagingId ?? "",
        packages: packageCountOf(line.packages),
      }
    : { loadedBy: "quantity", ...common, quantity: quantityOf(line, products) };
}

type PurchaseRegistrationRequest = Omit<PurchaseRegistrationBody, "receiptType"> & {
  receiptType: ReceiptType | null;
};

export function purchaseRegistrationRequestFrom(
  values: PurchaseFormValues,
  products: PurchaseProducts,
): PurchaseRegistrationRequest {
  return {
    supplierId: values.supplierId ?? "",
    purchasedOn: values.purchasedOn?.toString() ?? "",
    receiptType: values.receiptType,
    receiptNumber: values.receiptNumber.trim(),
    note: values.note.trim(),
    lines: values.lines.map((line) => lineRequestFrom(line, products)),
  };
}

function lineProblem(line: PurchaseLineValues, products: PurchaseProducts): string {
  if (line.productId === null) {
    return "Elegí el producto.";
  }
  if (line.loadedBy === "packaging") {
    if (line.packagingId === null) {
      return "Elegí la presentación.";
    }
    if (Number.isNaN(packageCountOf(line.packages))) {
      return "Ingresá cuántas presentaciones compraste, en un número entero.";
    }
  } else if (Number.isNaN(quantityOf(line, products))) {
    return quantityMessage(saleUnitOf(products, line.productId));
  }
  if (parseAmountCents(line.cost) === undefined) {
    return "Escribí el costo pagado con coma para los centavos, por ejemplo 1.250,50.";
  }
  return "Revisá los valores.";
}

export function purchaseLinesMessage(
  { lines }: PurchaseFormValues,
  products: PurchaseProducts,
): string {
  if (lines.length === 0) {
    return "Agregá al menos una línea.";
  }
  const request = lines.map((line) => lineRequestFrom(line, products));
  const index = lines.findIndex((_, position) => {
    const checked = purchaseRegistrationBodySchema.shape.lines.element.safeParse(request[position]);
    return !checked.success;
  });
  const position = index === -1 ? 0 : index;
  const line = lines[position];
  return `Línea ${position + 1}: ${line ? lineProblem(line, products) : "Revisá los valores."}`;
}

export function purchaseLineQuantityRefusal(
  line: PurchaseLineValues | undefined,
  products: PurchaseProducts,
): string {
  return line?.loadedBy === "packaging"
    ? "Son demasiadas presentaciones para una sola línea."
    : quantityMessage(saleUnitOf(products, line?.productId ?? null));
}

const supplierNameOrder = textOrder((supplier: SupplierSummary) => supplier.name);

export function purchaseSupplierOptions(
  suppliers: readonly SupplierSummary[],
): [{ value: string; label: string }, ...{ value: string; label: string }[]] | undefined {
  const [first, ...rest] = sortedItems(suppliers, {
    order: supplierNameOrder,
    direction: "ascending",
  }).map((supplier) => ({ value: supplier.id, label: supplier.name }));
  return first && [first, ...rest];
}

export function purchasePackagingOptions(
  packagings: readonly PackagingSummary[],
  productId: string | null,
): { value: string; label: string }[] {
  return packagings
    .filter((packaging) => packaging.productId === productId)
    .map((packaging) => ({
      value: packaging.id,
      label: `${packaging.name} (${formatStockQuantity(packaging.quantityPerPackage, packaging.saleUnit)})`,
    }));
}
