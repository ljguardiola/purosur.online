import { formatCalendarDayRange } from "@purosur/ui";
import { expect, test } from "vitest";
import { alertScopeLabel } from "./alert-scope-label";

test("names an ARCA environment in Spanish", () => {
  expect(alertScopeLabel("environment", "production")).toBe("Producción");
  expect(alertScopeLabel("environment", "homologation")).toBe("Homologación");
});

test("shows an ARCA environment this app does not know yet, such as one a later cloud adds, as it comes", () => {
  expect(alertScopeLabel("environment", "staging")).toBe("staging");
});

test("names the point of sale and the invoice class of a rejected invoice", () => {
  expect(alertScopeLabel("pointOfSaleDocumentType", "12:factura_c")).toBe(
    "Punto de venta 12 · Factura C",
  );
});

test("shows the scope of a rejected invoice of a document type this app does not know yet as it comes", () => {
  expect(alertScopeLabel("pointOfSaleDocumentType", "12:factura_z")).toBe("12:factura_z");
});

test("names the task of a refund instead of showing its id", () => {
  expect(alertScopeLabel("refund", "3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6")).toBe(
    "Tarea de reembolso",
  );
});

test("names the document of an unclear outcome instead of showing its id", () => {
  expect(alertScopeLabel("fiscalDocument", "3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6")).toBe(
    "Comprobante",
  );
});

test("shows any other kind of scope as the cloud displays it", () => {
  expect(alertScopeLabel("register", "production")).toBe("production");
});

test("shows the scope of a kind the cloud gives no kind of scope for as it comes", () => {
  expect(alertScopeLabel(null, "production")).toBe("production");
});

test("shows an ARCA environment that shares its name with a member every object has as it comes", () => {
  expect(alertScopeLabel("environment", "constructor")).toBe("constructor");
  expect(alertScopeLabel("environment", "toString")).toBe("toString");
});

test("names the branch of an alert instead of showing its id", () => {
  expect(alertScopeLabel("branch", "3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6")).toBe("Sucursal");
});

test("names the point of sale and the fortnight of a fortnight's report", () => {
  expect(alertScopeLabel("pointOfSaleFortnight", "4:2026-09-01:2026-09-15")).toBe(
    `Punto de venta 00004 · ${formatCalendarDayRange("2026-09-01", "2026-09-15")}`,
  );
});

test("shows the scope of a fortnight's report it cannot read as it comes", () => {
  expect(alertScopeLabel("pointOfSaleFortnight", "4:2026-09-01")).toBe("4:2026-09-01");
  expect(alertScopeLabel("pointOfSaleFortnight", "x:2026-09-01:2026-09-15")).toBe(
    "x:2026-09-01:2026-09-15",
  );
});

test("names the point of sale, the invoice class and the number of a voucher issued outside the system", () => {
  expect(alertScopeLabel("pointOfSaleDocumentNumber", "3:factura_c:41")).toBe(
    "Punto de venta 00003 · Factura C · 00000041",
  );
});

test("names the point of sale, the credit note class and the number of a credit note issued outside the system", () => {
  expect(alertScopeLabel("pointOfSaleDocumentNumber", "12:credit_note_c:3")).toBe(
    "Punto de venta 00012 · Nota de crédito C · 00000003",
  );
});

test.each(["3:factura_z:41", "3:factura_c", "x:factura_c:41", "3:factura_c:x"])(
  "shows the scope %j of a voucher issued outside the system that it cannot read as it comes",
  (scopeDisplay) => {
    expect(alertScopeLabel("pointOfSaleDocumentNumber", scopeDisplay)).toBe(scopeDisplay);
  },
);
