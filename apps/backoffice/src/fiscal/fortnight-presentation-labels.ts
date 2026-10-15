import { formatNumber, type Tone } from "@purosur/ui";
import type { FortnightPresentation } from "./fortnight-presentations-api";

const STATE_BADGES: Record<
  NonNullable<FortnightPresentation["state"]> | "pending",
  { label: string; tone: Tone }
> = {
  pending: { label: "Pendiente", tone: "warning" },
  submitting: { label: "Presentando", tone: "info" },
  refused: { label: "Rechazado", tone: "error" },
  blocked: { label: "Bloqueado", tone: "error" },
  accepted: { label: "Aceptado", tone: "success" },
  needs_regularization: { label: "A regularizar", tone: "error" },
};

const NOT_APPLICABLE = "—";

export function presentationStateBadge({
  state,
  rejectedDocument,
}: Pick<FortnightPresentation, "state" | "rejectedDocument">) {
  if (state === "refused" && rejectedDocument !== null) {
    return { label: "Rechazado en parte", tone: "error" } as const;
  }
  return STATE_BADGES[state ?? "pending"];
}

export function presentationDocumentTypeLabel(documentType: FortnightPresentation["documentType"]) {
  return documentType === "factura_c" ? "Factura C" : NOT_APPLICABLE;
}

export function presentationDocumentsLabel({
  documentType,
  state,
  documentCount,
  rejectedDocument,
}: Pick<FortnightPresentation, "documentType" | "state" | "documentCount" | "rejectedDocument">) {
  if (documentType === null) {
    if (state === "accepted") {
      return "Sin movimiento";
    }
    if (state === "needs_regularization") {
      return documentCount === 1
        ? "1 llegó después"
        : `${formatNumber(documentCount)} llegaron después`;
    }
    return NOT_APPLICABLE;
  }
  if (rejectedDocument !== null) {
    return rejectedDocument.unprocessed === 0
      ? "1 rechazado"
      : `1 rechazado · ${formatNumber(rejectedDocument.unprocessed)} sin procesar`;
  }
  return documentCount === 1 ? "1 comprobante" : `${formatNumber(documentCount)} comprobantes`;
}
