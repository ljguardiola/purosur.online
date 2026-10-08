import { expect, test } from "vitest";
import { alertKindLabel } from "./alert-kind-label";

test("names a kind of the catalog by its title", () => {
  expect(alertKindLabel("backoffice_passkey_changed")).toBe("Passkey");
  expect(alertKindLabel("user_access_increased")).toBe("Acceso ampliado");
  expect(alertKindLabel("arca_certificate_expiring")).toBe("Certificado de ARCA por vencer");
  expect(alertKindLabel("update_required")).toBe("Versión de caja no aceptada");
});

test("names a kind this app does not know yet, such as one a later cloud adds, by the kind itself", () => {
  expect(alertKindLabel("register_battery_low")).toBe("register_battery_low");
});

test("names a kind that shares its name with a member every object has by the kind itself", () => {
  expect(alertKindLabel("constructor")).toBe("constructor");
  expect(alertKindLabel("toString")).toBe("toString");
});
