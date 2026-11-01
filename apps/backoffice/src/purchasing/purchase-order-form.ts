import {
  type PurchaseOrderDetail,
  type PurchaseOrderEditBody,
  purchaseOrderEditBodySchema,
} from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { formatStockQuantityInput, quantityMessage } from "../platform/stock-quantity";
import { packageCountOf, quantityPerPackageOf } from "./package-count-form";

export type OrderLineValues = {
  id: number;
  fromOrder: boolean;
  productId: string | null;
  saleUnit: SaleUnit;
  packages: string;
  quantityPerPackage: string;
};

export type PurchaseOrderFormValues = {
  lines: OrderLineValues[];
};

export const PURCHASE_ORDER_FIELDS = {
  lines: "lines",
  productId: "lines",
  packages: "lines",
  quantityPerPackage: "lines",
} as const;

export function purchaseOrderFormValuesOf(order: PurchaseOrderDetail): PurchaseOrderFormValues {
  return {
    lines: order.lines.map((line, index) => ({
      id: index + 1,
      fromOrder: true,
      productId: line.product.id,
      saleUnit: line.product.saleUnit,
      packages: String(line.packages),
      quantityPerPackage: formatStockQuantityInput(line.quantityPerPackage, line.product.saleUnit),
    })),
  };
}

export function emptyOrderLine(id: number): OrderLineValues {
  return {
    id,
    fromOrder: false,
    productId: null,
    saleUnit: "UNIT",
    packages: "",
    quantityPerPackage: "",
  };
}

export function nextOrderLineId(lines: readonly OrderLineValues[]): number {
  return Math.max(0, ...lines.map((line) => line.id)) + 1;
}

function lineRequestFrom(line: OrderLineValues): PurchaseOrderEditBody["lines"][number] {
  return {
    productId: line.productId ?? "",
    packages: packageCountOf(line.packages),
    quantityPerPackage: quantityPerPackageOf(line.quantityPerPackage, line.saleUnit),
  };
}

export function purchaseOrderEditRequestFrom({
  lines,
}: PurchaseOrderFormValues): PurchaseOrderEditBody {
  return { lines: lines.map(lineRequestFrom) };
}

function lineProblem(line: OrderLineValues): string {
  if (line.productId === null) {
    return "Elegí el producto.";
  }
  if (Number.isNaN(packageCountOf(line.packages))) {
    return "Ingresá cuántos paquetes pedir, en un número entero.";
  }
  return quantityMessage(line.saleUnit);
}

export function purchaseOrderLinesMessage({ lines }: PurchaseOrderFormValues): string {
  if (lines.length === 0) {
    return "Agregá al menos una línea.";
  }
  const index = lines.findIndex(
    (line) =>
      !purchaseOrderEditBodySchema.shape.lines.element.safeParse(lineRequestFrom(line)).success,
  );
  const failing = lines[index];
  return failing === undefined
    ? "Revisá los paquetes y la cantidad por paquete de las líneas."
    : `Línea ${index + 1}: ${lineProblem(failing)}`;
}
