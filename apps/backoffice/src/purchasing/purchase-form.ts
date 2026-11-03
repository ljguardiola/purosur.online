import type { CalendarDate } from "@internationalized/date";
import {
  type PurchaseChoices,
  type PurchaseRegistrationBody,
  purchaseRegistrationBodySchema,
  type SupplierSummary,
} from "@purosur/contracts";
import type { ReceiptType } from "@purosur/domain";
import { parseAmountCents, sortedItems, textOrder } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { schemaLimit } from "../platform/schema-limit";
import { parseStockQuantity, quantityMessage } from "../platform/stock-quantity";
import { packageCountOf, quantityPerPackageOf } from "./package-count-form";
import type {
  AddPurchaseLinesOutcome,
  PurchaseLineRefusal,
  RegisterPurchaseOutcome,
} from "./purchases-api";
import { receiptLabel } from "./receipt-label";

const { receiptNumber: receiptNumberSchema, note: noteSchema } =
  purchaseRegistrationBodySchema.shape;

export type PurchaseProducts = PurchaseChoices["products"];

export type PurchaseLineValues = {
  id: number;
  productId: string | null;
  loadedBy: "packages" | "quantity";
  packages: string;
  quantityPerPackage: string;
  quantity: string;
  cost: string;
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
    packages: "",
    quantityPerPackage: "",
    quantity: "",
    cost: "",
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
} satisfies Record<PurchaseLineRefusal, string>;

export function purchaseDateMessage({
  purchasedOn,
}: Pick<PurchaseFormValues, "purchasedOn">): string {
  return purchasedOn === null
    ? "Ingresá la fecha de la compra."
    : "La fecha de compra no puede ser posterior a hoy.";
}

export function purchaseReceiptNumberMessage({
  receiptType,
  receiptNumber,
}: Pick<PurchaseFormValues, "receiptType" | "receiptNumber">): string {
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

export function purchaseNoteMessage(_values: Pick<PurchaseFormValues, "note">): string {
  const limit = schemaLimit(noteSchema.meta()?.["maxLength"]);
  return `La nota puede tener hasta ${limit} caracteres.`;
}

function saleUnitOf(products: PurchaseProducts, productId: string | null) {
  return products.find((product) => product.id === productId)?.saleUnit ?? "UNIT";
}

function quantityOf(line: PurchaseLineValues, products: PurchaseProducts): number {
  return parseStockQuantity(line.quantity, saleUnitOf(products, line.productId)) ?? Number.NaN;
}

export function purchaseLineRequestFrom(
  line: PurchaseLineValues,
  products: PurchaseProducts,
): PurchaseRegistrationBody["lines"][number] {
  const common = {
    productId: line.productId ?? "",
    costPaidCents: parseAmountCents(line.cost) ?? Number.NaN,
    expiresOn: line.expiresOn?.toString() ?? "",
  };
  return line.loadedBy === "packages"
    ? {
        loadedBy: "packages",
        ...common,
        packages: packageCountOf(line.packages),
        quantityPerPackage: quantityPerPackageOf(
          line.quantityPerPackage,
          saleUnitOf(products, line.productId),
        ),
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
    lines: values.lines.map((line) => purchaseLineRequestFrom(line, products)),
  };
}

const purchaseLineSchema = purchaseRegistrationBodySchema.shape.lines.element;

function packagesRefused(line: PurchaseLineValues, products: PurchaseProducts): boolean {
  const checked = purchaseLineSchema.safeParse(purchaseLineRequestFrom(line, products));
  return checked.error?.issues.some((issue) => issue.path[0] === "packages") ?? false;
}

function packagesProblem(line: PurchaseLineValues, products: PurchaseProducts): string | null {
  const packages = packageCountOf(line.packages);
  if (Number.isNaN(packages)) {
    return "Ingresá cuántos paquetes compraste, en un número entero.";
  }
  if (!packagesRefused(line, products)) {
    return null;
  }
  return packages < 1
    ? "Ingresá cuántos paquetes compraste, en un número entero mayor a cero."
    : "Ingresá menos paquetes; son más de los que se pueden registrar.";
}

function lineProblem(line: PurchaseLineValues, products: PurchaseProducts): string {
  if (line.productId === null) {
    return "Elegí el producto.";
  }
  if (line.loadedBy === "packages") {
    const packages = packagesProblem(line, products);
    if (packages !== null) {
      return packages;
    }
    if (
      Number.isNaN(
        quantityPerPackageOf(line.quantityPerPackage, saleUnitOf(products, line.productId)),
      )
    ) {
      return quantityMessage(saleUnitOf(products, line.productId));
    }
  } else if (Number.isNaN(quantityOf(line, products))) {
    return quantityMessage(saleUnitOf(products, line.productId));
  }
  if (parseAmountCents(line.cost) === undefined) {
    return "Escribí el costo pagado con hasta 2 decimales, por ejemplo 1.250,50.";
  }
  return "Revisá los valores.";
}

export function purchaseLinesMessage(
  { lines }: Pick<PurchaseFormValues, "lines">,
  products: PurchaseProducts,
): string {
  if (lines.length === 0) {
    return "Agregá al menos una línea.";
  }
  const request = lines.map((line) => purchaseLineRequestFrom(line, products));
  const index = lines.findIndex((_, position) => {
    const checked = purchaseLineSchema.safeParse(request[position]);
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
  return line?.loadedBy === "packages"
    ? "Revisá la cantidad de paquetes y la cantidad por paquete."
    : quantityMessage(saleUnitOf(products, line?.productId ?? null));
}

export function purchaseLineRefusalsOf(
  outcome: AddPurchaseLinesOutcome | RegisterPurchaseOutcome,
  lines: readonly PurchaseLineValues[],
  products: PurchaseProducts,
): Record<number, string> | undefined {
  if (outcome.kind === "line_refused") {
    return { [outcome.lineIndex]: PURCHASE_LINE_REFUSALS[outcome.reason] };
  }
  if (outcome.kind === "validation_failed" && outcome.lineIndex !== undefined) {
    return { [outcome.lineIndex]: purchaseLineQuantityRefusal(lines[outcome.lineIndex], products) };
  }
  return undefined;
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

export function withCreatedSupplier(
  suppliers: readonly SupplierSummary[],
  created: SupplierSummary | null,
): readonly SupplierSummary[] {
  return created && !suppliers.some((supplier) => supplier.id === created.id)
    ? [...suppliers, created]
    : suppliers;
}

const productOrder = textOrder((product: PurchaseProducts[number]) =>
  formatProductDescription(product),
);

export function purchaseProductOptions(
  products: PurchaseProducts,
): [{ value: string; label: string }, ...{ value: string; label: string }[]] | undefined {
  const [first, ...rest] = sortedItems(products, {
    order: productOrder,
    direction: "ascending",
  }).map((product) => ({ value: product.id, label: formatProductDescription(product) }));
  return first && [first, ...rest];
}
