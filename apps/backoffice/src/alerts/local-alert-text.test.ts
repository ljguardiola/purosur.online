import { expect, test } from "vitest";
import { localAlertText } from "./local-alert-text";

test("gives a quiet register's alert its title, what it means and what to do", () => {
  expect(localAlertText("register_silent")).toEqual({
    title: "La caja no está sincronizando",
    meaning:
      "Hace rato que esta caja no logra mandar nada a la nube durante el horario de atención.",
    whatToDo:
      "Se puede seguir vendiendo con normalidad. Revisar la conexión a internet del local; en cuanto vuelva, la caja se pone al día sola. El Administrador ya fue avisado.",
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
