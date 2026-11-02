import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import {
  formatDate,
  formatNumber,
  formatProductDescription,
  formatSaleUnitQuantity,
  plural,
} from "@purosur/formatting";

export interface PurchaseOrderDocumentSource {
  supplier: { name: string };
  createdAt: Date;
  lines: {
    product: Parameters<typeof formatProductDescription>[0] & { saleUnit: "UNIT" | "KG" };
    packages: number;
    quantityPerPackage: number;
    supplierItem: { code: string | null; description: string } | null;
  }[];
}

export interface PurchaseOrderDocument {
  title: string;
  createdDay: string;
  lines: { product: string; supplierItem: string | null; quantity: string }[];
}

export function purchaseOrderDocument(order: PurchaseOrderDocumentSource): PurchaseOrderDocument {
  return {
    title: `Pedido a ${order.supplier.name}`,
    createdDay: formatDate(order.createdAt, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: ARGENTINA_TIME_ZONE,
    }),
    lines: order.lines.map(({ product, packages, quantityPerPackage, supplierItem }) => ({
      product: formatProductDescription(product),
      supplierItem: supplierItem
        ? [supplierItem.code, supplierItem.description].filter((part) => part !== null).join(" - ")
        : null,
      quantity: `${formatNumber(packages)} ${plural(packages, {
        one: "paquete",
        other: "paquetes",
      })} de ${formatSaleUnitQuantity(quantityPerPackage, product.saleUnit)}`,
    })),
  };
}
