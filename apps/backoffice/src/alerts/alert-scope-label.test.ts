import { expect, test } from "vitest";
import { alertScopeLabel } from "./alert-scope-label";

test("names the ARCA environment of an expiring certificate in Spanish", () => {
  expect(alertScopeLabel("arca_certificate_expiring", "production")).toBe("Producción");
  expect(alertScopeLabel("arca_certificate_expiring", "homologation")).toBe("Homologación");
});

test("shows an ARCA environment this app does not know yet, such as one a later cloud adds, as it comes", () => {
  expect(alertScopeLabel("arca_certificate_expiring", "staging")).toBe("staging");
});

test("names the point of sale and the invoice class of a rejected invoice", () => {
  expect(alertScopeLabel("fiscal_rejected", "12:factura_c")).toBe("Punto de venta 12 · Factura C");
});

test("shows the scope of a rejected invoice of a document type this app does not know yet as it comes", () => {
  expect(alertScopeLabel("fiscal_rejected", "12:factura_z")).toBe("12:factura_z");
});

test("shows the scope of any other kind as the cloud displays it", () => {
  expect(alertScopeLabel("register_enrolled", "production")).toBe("production");
});

test("shows an ARCA environment that shares its name with a member every object has as it comes", () => {
  expect(alertScopeLabel("arca_certificate_expiring", "constructor")).toBe("constructor");
  expect(alertScopeLabel("arca_certificate_expiring", "toString")).toBe("toString");
});
