import type { SaleCreditNote } from "@purosur/contracts";
import type { NoticeTone, SummaryRowProps } from "@purosur/ui";
import type { PrintableCreditNote, SaleDetailCreditNote } from "../shell/sale-receipt-text";
import {
  CREDIT_NOTE_NAME,
  creditNoteComprobantePresentation,
  receiptCopyPresentation,
} from "../shell/sale-receipt-text";

const LABEL = CREDIT_NOTE_NAME;

export function creditNoteRow(creditNote: SaleCreditNote): SummaryRowProps {
  switch (creditNote.kind) {
    case "authorized":
      return { label: LABEL, value: creditNoteComprobantePresentation(creditNote).detail };
    case "issued_offline": {
      const { name, detail } = creditNoteComprobantePresentation(creditNote);
      return { label: name, value: detail };
    }
    case "in_progress":
      return { label: LABEL, value: "En trámite con ARCA" };
    case "rejected":
      return { label: LABEL, value: "No emitida" };
    case "already_credited":
      return { label: LABEL, value: "No emitida: la factura ya tenía una" };
    case "regularization_required":
      return { label: LABEL, value: "A regularizar" };
  }
}

export function creditNoteRowOf({
  origin,
  standing,
}: Pick<SaleDetailCreditNote, "origin" | "standing">): SummaryRowProps {
  const row = creditNoteRow(standing);
  return origin === "sale_return" ? { ...row, label: `${row.label} de devolución` } : row;
}

export function isPrintableCreditNote(
  creditNote: SaleCreditNote,
): creditNote is PrintableCreditNote {
  return creditNote.kind === "authorized" || creditNote.kind === "issued_offline";
}

export function creditNotePrintButton(
  creditNote: SaleDetailCreditNote & { standing: PrintableCreditNote },
  named: boolean,
): string {
  const duplicate = creditNote.next_copy?.kind === "duplicate";
  const action = duplicate
    ? receiptCopyPresentation({ kind: "duplicate" }).printButton
    : "Imprimir";
  if (!named) {
    return duplicate ? action : "Imprimir nota de crédito";
  }
  const number = creditNoteComprobantePresentation(creditNote.standing).detail;
  return duplicate
    ? `${action} de nota de crédito ${number}`
    : `${action} nota de crédito ${number}`;
}

type Notice = { tone: NoticeTone; title: string; description: string };

export function voidedSaleNotice(creditNote: SaleCreditNote | null): Notice {
  const title = "Venta anulada";
  switch (creditNote?.kind) {
    case undefined:
    case "authorized":
    case "issued_offline":
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
    case "regularization_required":
      return {
        tone: "warning",
        title,
        description: "La nota de crédito quedó para regularizar. Avisá al Administrador.",
      };
  }
}
