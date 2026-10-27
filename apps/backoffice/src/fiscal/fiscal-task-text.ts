import type { FiscalTaskItem } from "@purosur/contracts";
import {
  formatCents,
  formatInvoiceNumber,
  formatNumber,
  formatPointOfSaleNumber,
} from "@purosur/ui";
import { fiscalTaskDate } from "./fiscal-task-moments";

const FISCAL_TASK_TITLES = {
  external_invoicing: "Facturación externa",
  credit_note_rejected: "Nota de crédito rechazada",
  deferred_sale_expired: "Venta diferida vencida",
} as const satisfies Record<FiscalTaskItem["kind"], string>;

export function fiscalTaskTitle(task: FiscalTaskItem): string {
  return task.kind === "credit_note_rejected" && task.number === null
    ? "Nota de crédito a regularizar"
    : FISCAL_TASK_TITLES[task.kind];
}

function voucherNumber(task: { point_of_sale: number; number: number }): string {
  return `${formatPointOfSaleNumber(task.point_of_sale)}-${formatInvoiceNumber(task.number)}`;
}

export function fiscalTaskDescription(task: FiscalTaskItem): string {
  switch (task.kind) {
    case "external_invoicing":
      return task.document_type === "credit_note_c"
        ? `Nota de crédito ${voucherNumber(task)} autorizada por ARCA fuera del sistema`
        : `Comprobante ${voucherNumber(task)} autorizado por ARCA fuera del sistema`;
    case "credit_note_rejected":
      return task.number === null
        ? "La nota de crédito no pudo emitirse con su fecha y debe regularizarse ante ARCA"
        : `ARCA rechazó la nota de crédito ${voucherNumber({ ...task, number: task.number })}`;
    case "deferred_sale_expired":
      return `Venta del ${fiscalTaskDate(task.sale_occurred_at)} por ${formatCents(task.total)} que no llegó a facturarse`;
  }
}

export function openFiscalTasksCountText(count: number): string {
  return count === 1 ? "1 tarea abierta" : `${formatNumber(count)} tareas abiertas`;
}
