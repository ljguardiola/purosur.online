import type { PrintCreditNoteOutcome, SaleCreditNote } from "@purosur/contracts";
import type { NoticeTone, SummaryRowProps } from "@purosur/ui";
import { formatInvoiceNumber, formatPointOfSaleNumber } from "@purosur/ui";

const LABEL = "Nota de crédito C";

export function creditNoteRow(creditNote: SaleCreditNote): SummaryRowProps {
  switch (creditNote.kind) {
    case "authorized":
      return {
        label: LABEL,
        value: `PV ${formatPointOfSaleNumber(creditNote.point_of_sale)} · Nº ${formatInvoiceNumber(creditNote.number)}`,
      };
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

export function creditNotePrintNotice(
  kind: Exclude<PrintCreditNoteOutcome["kind"], "not_found" | "not_signed_in">,
): Notice {
  switch (kind) {
    case "started":
      return {
        tone: "success",
        title: "La nota de crédito sale en cuanto la impresora esté lista",
        description: "Entregásela al cliente.",
      };
    case "busy":
      return {
        tone: "error",
        title: "Todavía puede salir una impresión de esta venta",
        description: "Esperá a que termine antes de imprimir la nota de crédito.",
      };
    case "printer_not_configured":
      return {
        tone: "error",
        title: "La impresora no está configurada",
        description: "Configurala para imprimir la nota de crédito.",
      };
    case "lacks_permission":
      return {
        tone: "error",
        title: "No tenés permiso para imprimir la nota de crédito",
        description: "Pedile a alguien con permiso que la imprima.",
      };
    case "unavailable":
      return {
        tone: "error",
        title: "No se pudo imprimir la nota de crédito",
        description: "Probá de nuevo.",
      };
  }
}
