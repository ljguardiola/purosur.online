import { expect, test } from "vitest";
import { alertKindLabel } from "./alert-kind-label";

test("names a kind of the catalog by its title", () => {
  expect(alertKindLabel("backoffice_passkey_changed")).toBe("Passkey");
  expect(alertKindLabel("user_access_increased")).toBe("Acceso ampliado");
  expect(alertKindLabel("arca_certificate_expiring")).toBe("Certificado de ARCA por vencer");
  expect(alertKindLabel("arca_wsaa_ticket_held")).toBe(
    "ARCA conserva un ticket de acceso anterior",
  );
  expect(alertKindLabel("register_enrolled")).toBe("Cambio de instalación de caja");
  expect(alertKindLabel("update_required")).toBe("Versión de caja no aceptada");
  expect(alertKindLabel("register_silent")).toBe("Caja sin sincronizar");
  expect(alertKindLabel("sales_denied")).toBe("Caja sin poder vender");
  expect(alertKindLabel("fiscal_rejected")).toBe("Factura rechazada por ARCA");
  expect(alertKindLabel("offline_authorization_code_missing")).toBe("CAEA sin bajar a la caja");
  expect(alertKindLabel("late_payment_refund")).toBe("Reembolso pendiente por un pago tardío");
  expect(alertKindLabel("refund_task")).toBe("Reembolso pendiente de una venta anulada");
  expect(alertKindLabel("fiscal_unknown")).toBe("Resultado fiscal incierto");
  expect(alertKindLabel("fiscal_emission_stopped")).toBe("Emisión de facturas detenida");
  expect(alertKindLabel("outbox_chain_broken")).toBe("Cadena de eventos alterada");
  expect(alertKindLabel("external_billing")).toBe("Facturación externa");
});

test("names a kind this app does not know yet, such as one a later cloud adds, by the kind itself", () => {
  expect(alertKindLabel("register_battery_low")).toBe("register_battery_low");
});

test("names a kind that shares its name with a member every object has by the kind itself", () => {
  expect(alertKindLabel("constructor")).toBe("constructor");
  expect(alertKindLabel("toString")).toBe("toString");
});

test("names the alert of lots nearing their expiry", () => {
  expect(alertKindLabel("lots_expiring")).toBe("Productos por vencer");
});

test("names the alert of an offsite dump that could not be verified", () => {
  expect(alertKindLabel("offsite_dump_unverified")).toBe(
    "Copia de seguridad externa sin verificar",
  );
});

test("names the notice and the missed deadline of a fortnight's report", () => {
  expect(alertKindLabel("fortnight_report_pending")).toBe("Informe de quincena pendiente");
  expect(alertKindLabel("fortnight_report_overdue")).toBe("Informe de quincena vencido");
});

test("names the alert of a fortnight reported without movement that later received invoices", () => {
  expect(alertKindLabel("fortnight_report_needs_regularization")).toBe("Quincena a regularizar");
});

test("names the alert of a register's clock corrected from the register", () => {
  expect(alertKindLabel("clock_corrected")).toBe("Reloj de la caja corregido");
});
