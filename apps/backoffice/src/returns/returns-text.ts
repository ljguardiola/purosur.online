import type { ReturnsReportBody } from "@purosur/contracts";
import { formatInvoiceNumber, formatOperationNumber, formatPointOfSaleNumber } from "@purosur/ui";

type ReturnRow = ReturnsReportBody["typed"]["rows"][number];
type ReturnLine = ReturnRow["lines"][number];

export const UNIDENTIFIED = "Sin identificar";
export const NO_CASHIER = "Sin dato";

const REASON_TEXT: Record<ReturnLine["reason"], string> = {
  change_of_mind: "Arrepentimiento",
  defective: "Defecto",
};

const DISPOSITION_TEXT: Record<ReturnLine["disposition"], string> = {
  restock: "vuelve a la venta",
  discard: "se descarta",
};

const RESOLUTION_TEXT: Record<ReturnLine["resolution"], string> = {
  refund: "Reintegro",
  exchange: "Cambio",
};

export function returnLineReasonText(reason: ReturnLine["reason"]): string {
  return REASON_TEXT[reason];
}

export function returnLineDispositionText(disposition: ReturnLine["disposition"]): string {
  return DISPOSITION_TEXT[disposition];
}

export function returnLineResolutionText(resolution: ReturnLine["resolution"]): string {
  return RESOLUTION_TEXT[resolution];
}

export function returnLineDetail({
  reason,
  disposition,
  resolution,
}: Pick<ReturnLine, "reason" | "disposition" | "resolution">): string {
  return `${returnLineReasonText(reason)} · ${returnLineDispositionText(disposition)} · ${returnLineResolutionText(resolution)}`;
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
