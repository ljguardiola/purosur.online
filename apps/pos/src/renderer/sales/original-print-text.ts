import type { PrintCreditNoteOutcome } from "@purosur/contracts";
import type { NoticeTone } from "@purosur/ui";

type Notice = { tone: NoticeTone; title: string; description: string };

export function creditNotePrintNotice(
  kind: Exclude<PrintCreditNoteOutcome["kind"], "not_found" | "sale_voided" | "not_signed_in">,
): Notice {
  switch (kind) {
    case "started":
      return {
        tone: "success",
        title: "La nota de crédito sale en cuanto la impresora esté lista",
        description: "Entregásela al cliente.",
      };
    case "already_attempted":
      return {
        tone: "error",
        title: "Puede que la nota de crédito haya salido",
        description: "Ahora se reimprime como duplicado, pidiendo el motivo.",
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
