import { expect, expectTypeOf, test } from "vitest";
import { isLocalAlertKind, type LocalAlertKind, localAlertText } from "./local-alert-texts";

test("gives a quiet register's alert its title, what it means and what to do", () => {
  expect(localAlertText("register_silent")).toEqual({
    title: "La caja no está sincronizando",
    meaning:
      "Hace rato que esta caja no logra mandar nada a la nube durante el horario de atención.",
    whatToDo:
      "Se puede seguir vendiendo con normalidad. Revisar la conexión a internet del local; en cuanto vuelva, la caja se pone al día sola. El Administrador ya fue avisado.",
  });
});

test("gives a register that can't sell its alert's title, what it means and what to do", () => {
  expect(localAlertText("sales_denied")).toEqual({
    title: "La caja no puede vender",
    meaning:
      "Esta caja dejó de abrir ventas nuevas porque encontró un problema en su registro de operaciones.",
    whatToDo:
      "Avisar al Administrador de inmediato; ya fue notificado, pero conviene confirmarle la situación.",
  });
});

test("gives no fixed text to a kind that has none, nor to one this app does not know yet", () => {
  expect(localAlertText("update_required")).toBeUndefined();
  expect(localAlertText("register_battery_low")).toBeUndefined();
});

test("gives no fixed text to a kind that shares its name with a member every object has", () => {
  expect(localAlertText("constructor")).toBeUndefined();
  expect(localAlertText("toString")).toBeUndefined();
});

test("knows the kinds that have a fixed text", () => {
  expect(isLocalAlertKind("register_silent")).toBe(true);
  expect(isLocalAlertKind("sales_denied")).toBe(true);
});

test("does not know a kind that has none, nor a member every object has", () => {
  expect(isLocalAlertKind("update_required")).toBe(false);
  expect(isLocalAlertKind("constructor")).toBe(false);
});

test("names exactly the kinds that have a fixed text", () => {
  expectTypeOf<LocalAlertKind>().toEqualTypeOf<"register_silent" | "sales_denied">();
});
