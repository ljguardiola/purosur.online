import type { SaleCreditNote } from "@purosur/contracts";
import type { NoticeTone, SummaryRowProps } from "@purosur/ui";
import { CREDIT_NOTE_NAME, creditNoteComprobantePresentation } from "../shell/sale-receipt-text";

const LABEL = CREDIT_NOTE_NAME;

export function creditNoteRow(creditNote: SaleCreditNote): SummaryRowProps {
  switch (creditNote.kind) {
    case "authorized":
      return { label: LABEL, value: creditNoteComprobantePresentation(creditNote).detail };
    case "in_progress":
      return { label: LABEL, value: "En trámite con ARCA" };
    case "rejected":
      return { label: LABEL, value: "No emitida" };
    case "already_credited":
      return { label: LABEL, value: "No emitida: la factura ya tenía una" };
  }
}

type Notice = { tone: NoticeTone; title: string; description: string };

export function voidedSaleNotice(creditNote: SaleCreditNote | null): Notice {
  const title = "Venta anulada";
  switch (creditNote?.kind) {
    case undefined:
    case "authorized":
      return { tone: "success", title, description: "La mercadería volvió al stock." };
    case "in_progress":
      return {
        tone: "warning",
        title,
        description:
          "La nota de crédito quedó en trámite con ARCA. La imprimís desde el historial cuando esté.",
      };
    case "rejected":
      return {
        tone: "warning",
        title,
        description: "ARCA rechazó la nota de crédito. Avisá al Administrador.",
      };
    case "already_credited":
      return {
        tone: "warning",
        title,
        description: "La factura ya tenía nota de crédito, así que no se emitió otra.",
      };
  }
}
