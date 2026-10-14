import { expect, test } from "vitest";
import { alertKindDescription } from "./alert-kind-description";

test("describes a kind of the catalog by what happened", () => {
  expect(alertKindDescription("register_enrolled")).toBe("Se dio de alta una caja");
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

test("describes the refund of a cancelled sale left without being marked as done", () => {
  expect(alertKindDescription("refund_task")).toBe(
    "Una venta anulada tiene un reembolso sin marcar como hecho",
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

test("describes a branch with lots nearing their expiry date", () => {
  expect(alertKindDescription("lots_expiring")).toBe(
    "Hay lotes de productos que están por llegar a su fecha de vencimiento.",
  );
});
