import type { ContingencyBackupTicketsAnswer } from "@purosur/contracts";
import { NotificationCard, plural } from "@purosur/ui";
import { CircleCheck, KeyRound, Printer } from "lucide-react";
import { backupPrinterWhatToDo } from "./contingency-backup-printer-failure-text";
import { hasPendingBackupTickets } from "./contingency-backup-tickets-notice-count";

export function ContingencyBackupTicketsNoticeCard({
  tickets,
  onDiscard,
}: {
  tickets: ContingencyBackupTicketsAnswer;
  onDiscard: () => void;
}) {
  const pending = tickets.to_print + tickets.awaiting_customer_document;
  return (
    <>
      {hasPendingBackupTickets(tickets) ? (
        <NotificationCard
          tone="warning"
          icon={<Printer />}
          title="Tickets de respaldo sin imprimir"
          description={`${pending} ${plural(pending, { one: "ticket de respaldo", other: "tickets de respaldo" })} de contingencia todavía no ${plural(pending, { one: "salió", other: "salieron" })} de la impresora.`}
          whatToDo={backupPrinterWhatToDo(tickets.printer)}
        />
      ) : null}
      {tickets.missing_key > 0 ? (
        <NotificationCard
          tone="error"
          icon={<KeyRound />}
          title="No se pudo armar el ticket de respaldo"
          description={`La caja no tiene su clave de respaldo para ${tickets.missing_key} ${plural(tickets.missing_key, { one: "operación", other: "operaciones" })}.`}
          whatToDo="Avisá al administrador: se resuelve cuando la caja vuelva a conectarse con la nube."
        />
      ) : null}
      {tickets.may_discard ? (
        <NotificationCard
          tone="success"
          icon={<CircleCheck />}
          title="Ya podés descartar los tickets de respaldo"
          description={`Esta caja sincronizó con la nube todo lo de la contingencia: ${plural(tickets.discardable, { one: "el ticket guardado", other: `los ${tickets.discardable} tickets guardados` })} en la caja del local ya no ${plural(tickets.discardable, { one: "hace", other: "hacen" })} falta.`}
          whatToDo="Tiralos y cerrá este aviso."
          onClose={onDiscard}
        />
      ) : null}
    </>
  );
}
