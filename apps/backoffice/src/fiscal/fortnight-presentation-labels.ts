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
  missing_document: { label: "Falta un comprobante", tone: "error" },
  accepted: { label: "Aceptado", tone: "success" },
  needs_regularization: { label: "A regularizar", tone: "error" },
  listed_as_owed: { label: "Adeudada según ARCA", tone: "error" },
};

const NOT_APPLICABLE = "—";

export function presentationStateBadge({
  state,
  refusal,
}: Pick<FortnightPresentation, "state" | "refusal">) {
  if (refusal === "partial") {
    return { label: "Rechazado en parte", tone: "error" } as const;
  }
  return STATE_BADGES[state ?? "pending"];
}

export function presentationDocumentTypeLabel(documentType: FortnightPresentation["documentType"]) {
  return documentType === "factura_c" ? "Factura C" : NOT_APPLICABLE;
}

export function presentationDocumentsLabel({
  movement,
  state,
  documentCount,
  rejectedDocument,
}: Pick<FortnightPresentation, "movement" | "state" | "documentCount" | "rejectedDocument">) {
  if (state === "needs_regularization") {
    return documentCount === 1
      ? "1 llegó después"
      : `${formatNumber(documentCount)} llegaron después`;
  }
  if (movement === "none") {
    return "Sin movimiento";
  }
  if (movement === null) {
    return NOT_APPLICABLE;
  }
  if (rejectedDocument !== null) {
    return rejectedDocument.unprocessed === 0
      ? "1 rechazado"
      : `1 rechazado · ${formatNumber(rejectedDocument.unprocessed)} sin procesar`;
  }
  return documentCount === 1 ? "1 comprobante" : `${formatNumber(documentCount)} comprobantes`;
}
