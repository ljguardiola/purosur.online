import type { PrintOriginalReceiptOutcome } from "@purosur/contracts";
import type { PrintedDocument } from "@purosur/domain";
import type { NoticeTone } from "@purosur/ui";

type Notice = { tone: NoticeTone; title: string; description: string };

type Wording = {
  subject: string;
  startedDescription: string;
  mayHaveComeOut: string;
  someoneElsePrints: string;
};

const WORDINGS: Record<PrintedDocument, Wording> = {
  sale_receipt: {
    subject: "el ticket",
    startedDescription: "Entregáselo al cliente.",
    mayHaveComeOut: "Puede que el ticket haya salido",
    someoneElsePrints: "Pedile a alguien con permiso que lo imprima.",
  },
  credit_note: {
    subject: "la nota de crédito",
    startedDescription: "Entregásela al cliente.",
    mayHaveComeOut: "Puede que la nota de crédito haya salido",
    someoneElsePrints: "Pedile a alguien con permiso que la imprima.",
  },
};

export function originalPrintNotice(
  document: PrintedDocument,
  kind: Exclude<PrintOriginalReceiptOutcome["kind"], "not_found" | "sale_voided" | "not_signed_in">,
): Notice {
  const wording = WORDINGS[document];
  switch (kind) {
    case "started":
      return {
        tone: "success",
        title: `${capitalized(wording.subject)} sale en cuanto la impresora esté lista`,
        description: wording.startedDescription,
      };
    case "already_attempted":
      return {
        tone: "error",
        title: wording.mayHaveComeOut,
        description: "Ahora se reimprime como duplicado, pidiendo el motivo.",
      };
    case "busy":
      return {
        tone: "error",
        title: "Todavía puede salir una impresión de esta venta",
        description: `Esperá a que termine antes de imprimir ${wording.subject}.`,
      };
    case "printer_not_configured":
      return {
        tone: "error",
        title: "La impresora no está configurada",
        description: `Configurala para imprimir ${wording.subject}.`,
      };
    case "lacks_permission":
      return {
        tone: "error",
        title: `No tenés permiso para imprimir ${wording.subject}`,
        description: wording.someoneElsePrints,
      };
    case "unavailable":
      return {
        tone: "error",
        title: `No se pudo imprimir ${wording.subject}`,
        description: "Probá de nuevo.",
      };
  }
}

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
