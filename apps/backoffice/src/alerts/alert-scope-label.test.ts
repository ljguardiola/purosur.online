import { expect, test } from "vitest";
import { alertScopeLabel } from "./alert-scope-label";

test("names the ARCA environment of an expiring certificate in Spanish", () => {
  expect(alertScopeLabel("arca_certificate_expiring", "production")).toBe("Producción");
  expect(alertScopeLabel("arca_certificate_expiring", "homologation")).toBe("Homologación");
});

test("shows an ARCA environment this app does not know yet, such as one a later cloud adds, as it comes", () => {
  expect(alertScopeLabel("arca_certificate_expiring", "staging")).toBe("staging");
});

test("shows the scope of any other kind as the cloud displays it", () => {
  expect(alertScopeLabel("register_enrolled", "production")).toBe("production");
});

test("shows an ARCA environment that shares its name with a member every object has as it comes", () => {
  expect(alertScopeLabel("arca_certificate_expiring", "constructor")).toBe("constructor");
  expect(alertScopeLabel("arca_certificate_expiring", "toString")).toBe("toString");
});
