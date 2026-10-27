import type { ReturnsReportBody } from "@purosur/contracts";
import {
  formatInvoiceNumber,
  formatNumber,
  formatOperationNumber,
  formatPointOfSaleNumber,
  formatWeight,
} from "@purosur/ui";

type ReturnRow = ReturnsReportBody["typed"]["rows"][number];
type ReturnLine = ReturnRow["lines"][number];

const REASON_TEXT: Record<ReturnLine["reason"], string> = {
  change_of_mind: "Arrepentimiento",
  defective: "Defecto",
};

const DISPOSITION_TEXT: Record<ReturnLine["disposition"], string> = {
  restock: "vuelve a la venta",
  discard: "se descarta",
};

export function returnedQuantityText(saleUnit: ReturnLine["sale_unit"], quantity: number): string {
  return saleUnit === "KG" ? formatWeight(quantity) : `${formatNumber(quantity)} u`;
}

export function returnLineDetail({
  reason,
  disposition,
}: Pick<ReturnLine, "reason" | "disposition">): string {
  return `${REASON_TEXT[reason]} · ${DISPOSITION_TEXT[disposition]}`;
}

export function returnSaleText({
  operation_number: operationNumber,
  invoice,
}: Pick<ReturnRow["sale"], "operation_number" | "invoice">): {
  operation: string | null;
  invoice: string | null;
} {
  return {
    operation:
      operationNumber === null ? null : `Operación ${formatOperationNumber(operationNumber)}`,
    invoice:
      invoice === null
        ? null
        : `Comprobante ${formatPointOfSaleNumber(invoice.point_of_sale)}-${formatInvoiceNumber(invoice.number)}`,
  };
}
