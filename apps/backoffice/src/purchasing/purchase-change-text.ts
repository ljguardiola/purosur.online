import {
  type PurchaseChange,
  type PurchaseSummary,
  purchaseChangeSchema,
} from "@purosur/contracts";
import { formatCents, formatDayAndTime } from "@purosur/ui";
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

const UNAVAILABLE_PRODUCT = "Producto no disponible";

export function purchaseChangeMoment(correctedAt: string): string {
  return formatDayAndTime(correctedAt, CORRECTED_AT_TIME_ZONE);
}

function transition(previous: string, next: string): string {
  return `${previous} → ${next}`;
}

function lineOf(purchase: PurchaseSummary, lineId: string) {
  return purchase.lines.find((line) => line.id === lineId);
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

export function purchaseChangeRows(
  change: PurchaseChangeDetail,
  purchase: PurchaseSummary,
): PurchaseChangeRow[] {
  switch (change.kind) {
    case "header":
      return change.changes.map(headerRow);
    case "lines_added":
      return change.lines.map((added) => {
        const product = lineOf(purchase, added.lineId)?.product;
        return {
          label: "Producto agregado",
          value: product
            ? [
                formatProductDescription(product),
                formatStockQuantity(added.quantity, product.saleUnit),
                formatCents(added.costPaidCents),
              ].join(" · ")
            : UNAVAILABLE_PRODUCT,
        };
      });
    case "line_expiry": {
      const product = lineOf(purchase, change.lineId)?.product;
      return [
        {
          label: `Vencimiento de ${product ? formatProductDescription(product) : UNAVAILABLE_PRODUCT}`,
          value: transition(expiryText(change.previous), expiryText(change.next)),
        },
      ];
    }
  }
}
