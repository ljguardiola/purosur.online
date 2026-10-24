import type { ContingencyBackupTicketRescueResponse } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  REFUSED_TICKET_TITLE,
  rescuedTicketTitle,
  rescuedTicketVouchersText,
} from "./rescued-ticket-text";

type Summary = Extract<ContingencyBackupTicketRescueResponse, { outcome: "rescued" }>["summary"];

const saleSummary: Summary = {
  operation: "sale",
  occurred_at: "2026-09-14T20:22:00.000Z",
  vouchers: [{ point_of_sale: 4, document_type: "factura_c", number: 301 }],
  sale_total: 894_000,
};

test("titles a ticket with its operation and the moment it happened, in Argentina", () => {
  expect(rescuedTicketTitle(saleSummary)).toBe("Venta del 14/09/2026 17:22");
});

test("shows the day in Argentina when it differs from the day in UTC", () => {
  expect(rescuedTicketTitle({ ...saleSummary, occurred_at: "2026-09-15T01:30:00.000Z" })).toBe(
    "Venta del 14/09/2026 22:30",
  );
});

test.each([
  ["sale", "Venta"],
  ["paid_sale_cancellation", "Anulación de una venta cobrada"],
  ["sale_void", "Anulación de una venta"],
  ["cash_movement", "Movimiento de caja"],
  ["cash_session_opening", "Apertura de caja"],
  ["cash_session_closing", "Cierre de caja"],
  ["initial_count", "Conteo inicial"],
  ["clock_correction", "Corrección del reloj"],
  ["reprint", "Reimpresión"],
] as const)("names the %s operation %s", (operation, label) => {
  expect(rescuedTicketTitle({ ...saleSummary, operation })).toBe(`${label} del 14/09/2026 17:22`);
});

test("titles a ticket whose operation is unknown by what it is", () => {
  expect(rescuedTicketTitle({ ...saleSummary, operation: null })).toBe("Ticket del 14/09/2026 17:22");
});

test("titles a ticket without a moment by its operation alone", () => {
  expect(rescuedTicketTitle({ ...saleSummary, occurred_at: null })).toBe("Venta");
});

test("writes each offline voucher with its type, point of sale and number, and says it is a CAEA one", () => {
  expect(rescuedTicketVouchersText(saleSummary)).toBe("Factura C 00004-00000301 · CAEA");
});

test("writes every voucher of a ticket", () => {
  expect(
    rescuedTicketVouchersText({
      ...saleSummary,
      vouchers: [
        { point_of_sale: 4, document_type: "factura_c", number: 301 },
        { point_of_sale: 4, document_type: "credit_note_c", number: 12 },
      ],
    }),
  ).toBe("Factura C 00004-00000301, Nota de crédito C 00004-00000012 · CAEA");
});

test("writes nothing for a ticket without vouchers", () => {
  expect(rescuedTicketVouchersText({ ...saleSummary, vouchers: [] })).toBeUndefined();
});

test("gives each refusal of the cloud its own title", () => {
  expect(REFUSED_TICKET_TITLE).toEqual({
    unreadable: "QR ilegible o de otro sistema",
    incomplete: "Faltan QR de este ticket",
    unknown_key: "Clave de cifrado desconocida",
    not_authentic: "El ticket no es auténtico",
    foreign_installation: "Ticket de otra instalación",
    conflicting: "Los QR no son del mismo ticket",
  });
});
