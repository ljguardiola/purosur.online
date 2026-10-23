import type { FiscalTaskItem, FiscalTasks, UnbilledDeferredSales } from "@purosur/contracts";

const DAY_SECONDS = 24 * 60 * 60;

export const externalInvoicingTask: Extract<FiscalTaskItem, { kind: "external_invoicing" }> = {
  id: "5b0b8f0e-4c36-4d6e-9d0e-0b1f0a9c1001",
  kind: "external_invoicing",
  register_id: "33333333-3333-4333-8333-333333333333",
  register_name: "Caja del frente",
  created_at: "2026-09-13T15:30:00.000Z",
  open_for_seconds: 3 * DAY_SECONDS + 600,
  alert: { level: "critical", escalated_at: "2026-09-14T15:30:00.000Z" },
  point_of_sale: 4,
  document_type: "factura_c",
  number: 1234,
  voucher: { issued_on: "2026-09-13", total: 1850000, authorization_code: "75123456789012" },
};

export const creditNoteRejectedTask: Extract<FiscalTaskItem, { kind: "credit_note_rejected" }> = {
  id: "5b0b8f0e-4c36-4d6e-9d0e-0b1f0a9c1002",
  kind: "credit_note_rejected",
  register_id: "33333333-3333-4333-8333-333333333333",
  register_name: "Caja del frente",
  created_at: "2026-09-15T12:00:00.000Z",
  open_for_seconds: 3600,
  alert: { level: "warning", escalated_at: null },
  point_of_sale: 4,
  number: 17,
  credit_note_id: "credit-note-17",
  rejections: [{ code: 10016, message: "Fecha fuera de rango" }],
};

export const deferredSaleExpiredTask: Extract<FiscalTaskItem, { kind: "deferred_sale_expired" }> = {
  id: "5b0b8f0e-4c36-4d6e-9d0e-0b1f0a9c1003",
  kind: "deferred_sale_expired",
  register_id: "44444444-4444-4444-8444-444444444444",
  register_name: "Caja del fondo",
  created_at: "2026-09-13T03:10:00.000Z",
  open_for_seconds: 2 * DAY_SECONDS,
  alert: null,
  sale_occurred_at: "2026-09-06T14:00:00.000Z",
  total: 1820000,
  short_code: "ABCD2345",
};

export const fiscalTasks: FiscalTasks = {
  tasks: [externalInvoicingTask, creditNoteRejectedTask, deferredSaleExpiredTask],
};

export const noFiscalTasks: FiscalTasks = { tasks: [] };

export const unbilledDeferredSales: UnbilledDeferredSales = {
  count: 3,
  oldest: { occurred_at: "2026-09-06T14:00:00.000Z", age_days: 6 },
};
