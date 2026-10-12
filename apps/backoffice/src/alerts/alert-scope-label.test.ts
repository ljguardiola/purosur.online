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
