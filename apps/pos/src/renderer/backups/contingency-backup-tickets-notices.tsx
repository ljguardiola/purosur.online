import type { ContingencyBackupTicketsAnswer } from "@purosur/contracts";
import type { NoticeTileProps } from "@purosur/ui";
import { formatNumber, plural } from "@purosur/ui";
import { CircleCheck, KeyRound, Printer } from "lucide-react";
import { backupPrinterWhatToDo } from "../shell/contingency-backup-printer-failure-text";
import { hasPendingBackupTickets } from "./contingency-backup-tickets-notice-count";

export type ContingencyBackupTicketsNotice = Omit<NoticeTileProps, "focused"> & {
  id: "missing-key" | "to-print" | "discardable";
  discardable: boolean;
};

export function contingencyBackupTicketsNotices(
  tickets: ContingencyBackupTicketsAnswer,
): ContingencyBackupTicketsNotice[] {
  const pending = tickets.to_print + tickets.awaiting_customer_document;
  const notices: ContingencyBackupTicketsNotice[] = [];
  if (tickets.missing_key > 0) {
    notices.push({
      id: "missing-key",
      tone: "error",
      icon: <KeyRound />,
      title: "No se pudo armar el ticket de respaldo",
      description: `La caja no tiene su clave de respaldo para ${formatNumber(tickets.missing_key)} ${plural(tickets.missing_key, { one: "operación", other: "operaciones" })}.`,
      whatToDo:
        "Avisá al administrador: se resuelve cuando la caja vuelva a conectarse con la nube.",
      discardable: false,
    });
  }
  if (hasPendingBackupTickets(tickets)) {
    notices.push({
      id: "to-print",
      tone: "warning",
      icon: <Printer />,
      title: "Tickets de respaldo sin imprimir",
      subtitle: `${formatNumber(pending)} sin imprimir`,
      description: `${formatNumber(pending)} ${plural(pending, { one: "ticket de respaldo", other: "tickets de respaldo" })} de contingencia todavía no ${plural(pending, { one: "salió", other: "salieron" })} de la impresora.`,
      whatToDo: backupPrinterWhatToDo(tickets.printer),
      discardable: false,
    });
  }
  if (tickets.may_discard) {
    notices.push({
      id: "discardable",
      tone: "success",
      icon: <CircleCheck />,
      title: "Ya podés descartar los tickets de respaldo",
      subtitle: `${formatNumber(tickets.discardable)} ${plural(tickets.discardable, { one: "ticket guardado", other: "tickets guardados" })}`,
      description: `Esta caja sincronizó con la nube todo lo de la contingencia: ${plural(tickets.discardable, { one: "el ticket guardado", other: `los ${formatNumber(tickets.discardable)} tickets guardados` })} en la caja del local ya no ${plural(tickets.discardable, { one: "hace", other: "hacen" })} falta.`,
      whatToDo: tickets.discard_permitted
        ? "Tiralos y cerrá este aviso."
        : "Tiralos. Este aviso lo cierra quien venda en esta caja.",
      discardable: tickets.discard_permitted,
    });
  }
  return notices;
}
