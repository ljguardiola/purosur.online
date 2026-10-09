import { expect, test } from "vitest";
import { alertKindDescription } from "./alert-kind-description";

test("describes a kind of the catalog by what happened", () => {
  expect(alertKindDescription("register_enrolled")).toBe("Se dio de alta una caja");
  expect(alertKindDescription("update_required")).toBe(
    "La nube ya no acepta la versión de esta caja",
  );
});

test("describes a register that stopped syncing", () => {
  expect(alertKindDescription("register_silent")).toBe("Una caja dejó de sincronizar");
});

test("describes a register that can't sell", () => {
  expect(alertKindDescription("sales_denied")).toBe("Una caja dejó de abrir ventas nuevas");
});

test("gives no description to a kind this app does not know yet", () => {
  expect(alertKindDescription("register_battery_low")).toBe("");
});

test("gives no description to a kind that shares its name with a member every object has", () => {
  expect(alertKindDescription("constructor")).toBe("");
  expect(alertKindDescription("toString")).toBe("");
});
