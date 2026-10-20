import { expect, test } from "vitest";
import { alertKindDescription } from "./alert-kind-description";

test("describes a kind of the catalog by what happened", () => {
  expect(alertKindDescription("register_enrolled")).toBe(
    "Se dio de alta o se revocó una instalación de caja",
  );
  expect(alertKindDescription("update_required")).toBe(
    "La nube ya no acepta la versión de esta caja",
  );
});

test("describes the wait for the authentication ticket ARCA still holds", () => {
  expect(alertKindDescription("arca_wsaa_ticket_held")).toBe(
    "La emisión fiscal en línea espera a que venza el ticket de acceso que ARCA todavía tiene vigente.",
  );
});

test("describes a register that stopped syncing", () => {
  expect(alertKindDescription("register_silent")).toBe("Una caja dejó de sincronizar");
});

test("describes a register that can't sell", () => {
  expect(alertKindDescription("sales_denied")).toBe("Una caja dejó de abrir ventas nuevas");
});

test("describes an invoice ARCA rejected", () => {
  expect(alertKindDescription("fiscal_rejected")).toBe("ARCA rechazó una factura");
});

test("describes a register that has not downloaded the fortnight's offline authorization code", () => {
  expect(alertKindDescription("offline_authorization_code_missing")).toBe(
    "Una caja todavía no bajó el CAEA de la quincena",
  );
});

test("describes a QR payment Mercado Pago charged that has to be given back, whatever its cause", () => {
  expect(alertKindDescription("late_payment_refund")).toBe(
    "Mercado Pago cobró un pago QR que hay que devolver",
  );
});

test("describes a cancelled sale with a pending refund", () => {
  expect(alertKindDescription("refund_task")).toBe(
    "Una venta anulada tiene un reembolso pendiente",
  );
});

test("describes a document left without a clear answer from ARCA", () => {
  expect(alertKindDescription("fiscal_unknown")).toBe(
    "Un comprobante quedó sin respuesta clara de ARCA",
  );
});

test("describes a register that can't issue fiscal documents", () => {
  expect(alertKindDescription("fiscal_emission_stopped")).toBe(
    "Una caja no puede emitir comprobantes fiscales",
  );
});

test("describes a register whose events were altered on its disk", () => {
  expect(alertKindDescription("outbox_chain_broken")).toBe(
    "Eventos de una caja alterados en su disco",
  );
});

test("gives no description to a kind this app does not know yet", () => {
  expect(alertKindDescription("register_battery_low")).toBe("");
});

test("gives no description to a kind that shares its name with a member every object has", () => {
  expect(alertKindDescription("constructor")).toBe("");
  expect(alertKindDescription("toString")).toBe("");
});

test("describes a branch with lots already expired or nearing their expiry date", () => {
  expect(alertKindDescription("lots_expiring")).toBe(
    "Hay lotes de productos vencidos o por llegar a su fecha de vencimiento.",
  );
});

test("describes an offsite dump of a night that could not be verified", () => {
  expect(alertKindDescription("offsite_dump_unverified")).toBe(
    "La copia cifrada de la base de datos de una noche no se pudo verificar fuera de la nube.",
  );
});

test("describes a fortnight's report not yet presented and one whose deadline was missed", () => {
  expect(alertKindDescription("fortnight_report_pending")).toBe(
    "Falta presentar a ARCA el informe de una quincena de un punto de venta",
  );
  expect(alertKindDescription("fortnight_report_overdue")).toBe(
    "Venció el plazo para presentar a ARCA el informe de una quincena de un punto de venta",
  );
});

test("describes a voucher issued outside the system", () => {
  expect(alertKindDescription("external_billing")).toBe(
    "Un comprobante se emitió fuera del sistema",
  );
});

test("describes a fortnight already reported without movement that later received invoices", () => {
  expect(alertKindDescription("fortnight_report_needs_regularization")).toBe(
    "Llegaron comprobantes de una quincena ya informada a ARCA sin movimiento",
  );
});

test("describes an invoice that already had a credit note when a sale was voided", () => {
  expect(alertKindDescription("invoice_already_credited")).toBe(
    "Se anuló una venta cuya factura ya tenía una nota de crédito, por lo que no se emitió otra",
  );
});

test("describes a register's clock confirmed as correct, which lowers the clock guard's mark", () => {
  expect(alertKindDescription("clock_corrected")).toBe(
    "Alguien confirmó desde la caja que su hora era correcta y bajó la marca de la guarda de reloj. Los comprobantes emitidos entre la lectura anterior y la nueva llevan fechas imposibles y van a regularización manual.",
  );
});

test("describes a presentation ARCA lists as owed for a point of sale this system does not run", () => {
  expect(alertKindDescription("fortnight_report_owed_elsewhere")).toBe(
    "ARCA informa adeudada la presentación de una quincena de un punto de venta que este sistema no maneja",
  );
});

test("describes a register that recorded changes and went more than an hour without a verified backup", () => {
  expect(alertKindDescription("register_backup_overdue")).toBe(
    "Una caja registró cambios y lleva más de una hora sin un backup verificado",
  );
});

test("describes a register whose clock differs from the real time by more than a minute", () => {
  expect(alertKindDescription("clock_drift")).toBe(
    "La hora de una caja difiere en más de un minuto de la hora real",
  );
});
