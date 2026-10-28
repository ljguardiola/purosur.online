import type { ReceiptCopyShown, SaleCreditNote } from "@purosur/contracts";
import type { NoticeTone, SummaryRowProps } from "@purosur/ui";
import type { SaleDetailCreditNote } from "../shell/sale-receipt-text";
import {
  CREDIT_NOTE_NAME,
  creditNoteComprobantePresentation,
  receiptCopyPresentation,
} from "../shell/sale-receipt-text";

const RETURN_CREDIT_NOTE_NAME = `${CREDIT_NOTE_NAME} de devolución`;

export function creditNoteRow(
  creditNote: SaleCreditNote,
  label: string = CREDIT_NOTE_NAME,
): SummaryRowProps {
  switch (creditNote.kind) {
    case "authorized":
    case "issued_offline": {
      const { name, detail } = creditNoteComprobantePresentation(creditNote, label);
      return { label: name, value: detail };
    }
    case "in_progress":
      return { label, value: "En trámite con ARCA" };
    case "rejected":
      return { label, value: "No emitida" };
    case "already_credited":
      return { label, value: "No emitida: la factura ya tenía una" };
    case "regularization_required":
      return { label, value: "A regularizar" };
  }
}

export function creditNoteRowOf({
  origin,
  standing,
}: Pick<SaleDetailCreditNote, "origin" | "standing">): SummaryRowProps {
  return creditNoteRow(
    standing,
    origin === "sale_return" ? RETURN_CREDIT_NOTE_NAME : CREDIT_NOTE_NAME,
  );
}

function creditNoteNumber(creditNote: SaleCreditNote): string | undefined {
  switch (creditNote.kind) {
    case "authorized":
    case "issued_offline":
      return creditNoteComprobantePresentation(creditNote).detail;
    case "in_progress":
    case "rejected":
    case "already_credited":
    case "regularization_required":
      return undefined;
  }
}

export function creditNotePrintButton(
  { standing, next_copy }: { standing: SaleCreditNote; next_copy: ReceiptCopyShown },
  numbered: boolean,
): string {
  const number = numbered ? creditNoteNumber(standing) : undefined;
  const document = number === undefined ? "nota de crédito" : `nota de crédito ${number}`;
  return next_copy.kind === "duplicate"
    ? `${receiptCopyPresentation(next_copy).printButton} de ${document}`
    : `Imprimir ${document}`;
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
