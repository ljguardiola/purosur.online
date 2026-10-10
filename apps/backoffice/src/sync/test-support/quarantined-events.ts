import type { QuarantinedEvent } from "../quarantined-events-api";

export const quarantinedSale: QuarantinedEvent = {
  eventId: "0192aaaa-0000-7000-8000-000000000001",
  registerName: "Caja 1",
  aggregateType: "Sale",
  aggregateId: "0192bbbb-1111-7000-8000-000000000001",
  eventType: "sale_completed",
  receivedAt: "2026-10-07T12:00:00.000Z",
  quarantinedAt: "2026-10-07T12:30:00.000Z",
  reason: {
    kind: "missing_dependency",
    aggregateType: "CashSession",
    aggregateId: "0192dddd-3333-7000-8000-000000000003",
  },
};

export const quarantinedCashClosing: QuarantinedEvent = {
  eventId: "0192aaaa-0000-7000-8000-000000000002",
  registerName: "Caja 2",
  aggregateType: "CashSession",
  aggregateId: "0192cccc-2222-7000-8000-000000000002",
  eventType: "cash_session_closed",
  receivedAt: "2026-10-07T13:00:00.000Z",
  quarantinedAt: "2026-10-07T13:30:00.000Z",
  reason: null,
};
