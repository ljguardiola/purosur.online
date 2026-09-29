import { expect, test } from "vitest";
import { alertKindLabel } from "./alert-kind-label";

test("names a kind of the catalog by its title", () => {
  expect(alertKindLabel("backoffice_passkey_changed")).toBe("Passkey");
  expect(alertKindLabel("user_access_increased")).toBe("Acceso ampliado");
});

test("names a kind this app does not know yet, such as one a later cloud adds, by the kind itself", () => {
  expect(alertKindLabel("register_battery_low")).toBe("register_battery_low");
});
