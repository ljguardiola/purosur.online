import { type PurchaseChange, purchaseChangeSchema } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { formatCents, formatDayAndTime, formatNumber } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { formatDisplayDate } from "../platform/display-date";
import { schemaText } from "../platform/schema-text";
import { formatStockQuantity } from "../platform/stock-quantity";
import { receiptLabel } from "./receipt-label";

const CORRECTED_AT_TIME_ZONE = schemaText(
  purchaseChangeSchema.shape.correctedAt.meta()?.["timeZone"],
);

type PurchaseChangeDetail = PurchaseChange["change"];

export type PurchaseChangeRow = { label: string; value: string };

export function purchaseChangeMoment(correctedAt: string): string {
  return formatDayAndTime(correctedAt, CORRECTED_AT_TIME_ZONE);
}

function transition(previous: string, next: string): string {
  return `${previous} → ${next}`;
}

type HeaderChange = Extract<PurchaseChangeDetail, { kind: "header" }>["changes"][number];

function headerRow(change: HeaderChange): PurchaseChangeRow {
  switch (change.field) {
    case "purchasedOn":
      return {
        label: "Fecha de compra",
        value: transition(formatDisplayDate(change.previous), formatDisplayDate(change.next)),
      };
    case "receiptType":
      return {
        label: "Tipo de comprobante",
        value: transition(receiptLabel(change.previous, null), receiptLabel(change.next, null)),
      };
    case "receiptNumber":
      return {
        label: "Número de comprobante",
        value: transition(change.previous ?? "Sin número", change.next ?? "Sin número"),
      };
    case "note":
      return {
        label: "Nota",
        value: transition(change.previous ?? "Sin nota", change.next ?? "Sin nota"),
      };
  }
}

function expiryText(expiresOn: string | null): string {
  return expiresOn === null ? "Sin vencimiento" : formatDisplayDate(expiresOn);
}

type LineQuantity = Extract<PurchaseChangeDetail, { kind: "line_quantity" }>["previous"];

function quantityText(quantity: LineQuantity, saleUnit: SaleUnit): string {
  const total = formatStockQuantity(quantity.quantity, saleUnit);
  if (quantity.packages === null) {
    return total;
  }
  const noun = quantity.packages === 1 ? "paquete" : "paquetes";
  return `${formatNumber(quantity.packages)} ${noun} (${total})`;
}

export function purchaseChangeRows(change: PurchaseChangeDetail): PurchaseChangeRow[] {
  switch (change.kind) {
    case "header":
      return change.changes.map(headerRow);
    case "lines_added":
      return change.lines.map((added) => ({
        label: "Producto agregado",
        value: [
          formatProductDescription(added.product),
          formatStockQuantity(added.quantity, added.product.saleUnit),
          formatCents(added.costPaidCents),
        ].join(" · "),
      }));
    case "line_quantity":
      return [
        {
          label: `Cantidad de ${formatProductDescription(change.product)}`,
          value: transition(
            quantityText(change.previous, change.product.saleUnit),
            quantityText(change.next, change.product.saleUnit),
          ),
        },
      ];
    case "line_product":
      return [
        {
          label: "Producto",
          value: transition(
            formatProductDescription(change.previous),
            formatProductDescription(change.next),
          ),
        },
      ];
    case "line_removed":
      return [
        {
          label: "Producto quitado",
          value: [
            formatProductDescription(change.product),
            quantityText(change, change.product.saleUnit),
            formatCents(change.costPaidCents),
          ].join(" · "),
        },
      ];
    case "line_cost":
      return [
        {
          label: `Costo de ${formatProductDescription(change.product)}`,
          value: transition(formatCents(change.previous), formatCents(change.next)),
        },
      ];
    case "line_expiry":
      return [
        {
          label: `Vencimiento de ${formatProductDescription(change.product)}`,
          value: transition(expiryText(change.previous), expiryText(change.next)),
        },
      ];
    case "line_expiry_split":
      return [
        {
          label: `Vencimiento de ${formatStockQuantity(change.quantity, change.product.saleUnit)} de ${formatProductDescription(change.product)}`,
          value: transition(expiryText(change.previous), expiryText(change.next)),
        },
      ];
  }
}
