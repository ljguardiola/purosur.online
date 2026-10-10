import { expect, expectTypeOf, test } from "vitest";
import {
  isLocalAlertKind,
  type LocalAlertKind,
  type LocalAlertSubject,
  localAlertText,
  localAlertTitle,
} from "./local-alert-texts";

test("gives a quiet register's alert its title, what it means and what to do", () => {
  expect(localAlertText({ kind: "register_silent" })).toEqual({
    title: "La caja no está sincronizando",
    meaning:
      "Hace rato que esta caja no logra mandar nada a la nube durante el horario de atención.",
    whatToDo:
      "Se puede seguir vendiendo con normalidad. Revisar la conexión a internet del local; en cuanto vuelva, la caja se pone al día sola. El Administrador ya fue avisado.",
  });
});

test("gives a register that can't sell because of its operation record its title, what it means and what to do", () => {
  expect(localAlertText({ kind: "sales_denied", reason: "event_history_broken" })).toEqual({
    title: "La caja no puede vender",
    meaning:
      "Esta caja dejó de abrir ventas nuevas porque encontró un problema en su registro de operaciones.",
    whatToDo:
      "Avisar al Administrador de inmediato; ya fue notificado, pero conviene confirmarle la situación.",
  });
});

test("gives a register that can't sell because its database is damaged its title, what it means and what to do", () => {
  expect(localAlertText({ kind: "sales_denied", reason: "local_database_damaged" })).toEqual({
    title: "La caja no puede vender",
    meaning: "Esta caja dejó de abrir ventas nuevas porque su base de datos está dañada.",
    whatToDo:
      "Restaurar la base de datos de la caja desde su copia de respaldo. No hace falta dar de alta la caja de nuevo: cuando vuelva a vender, esta alerta se cierra sola.",
  });
});

test("gives a register whose installation was revoked its condition's title, what it means and what to do", () => {
  expect(localAlertText({ kind: "installation_revoked" })).toEqual({
    title: "La instalación de esta caja fue revocada",
    meaning:
      "Esta caja ya no abre ventas nuevas: se dio de alta otra instalación para la misma caja, o la nube encontró un problema en el registro de operaciones que le envió. Lo que ya está guardado en la caja se conserva.",
    whatToDo:
      "Avisar al Administrador. Para volver a vender, hay que dar de alta la caja de nuevo con un código de alta emitido desde el backoffice, en Cajas registradoras.",
  });
});

test("gives a register whose scale or reader is missing its condition's title, what it means and what to do", () => {
  expect(localAlertText({ kind: "serial_device_missing" })).toEqual({
    title: "Revisar la balanza o el lector",
    meaning:
      "La balanza o el lector de códigos dejaron de responder en esta caja, o el conectado no es el registrado.",
    whatToDo:
      "Revisar que esté conectado y encendido. Mientras tanto, tipear el peso a mano y buscar los productos por nombre. Si el problema sigue, avisar al Administrador.",
  });
});

test("gives every kind that has a fixed text its title, whatever the reason", () => {
  expect(localAlertTitle("sales_denied")).toBe("La caja no puede vender");
  expect(localAlertTitle("register_silent")).toBe("La caja no está sincronizando");
  expect(localAlertTitle("installation_revoked")).toBe("La instalación de esta caja fue revocada");
  expect(localAlertTitle("serial_device_missing")).toBe("Revisar la balanza o el lector");
});

test("gives no title to a kind that has none, nor to one this app does not know yet", () => {
  expect(localAlertTitle("update_required")).toBeUndefined();
  expect(localAlertTitle("register_battery_low")).toBeUndefined();
});

test("gives no title to a kind that shares its name with a member every object has", () => {
  expect(localAlertTitle("constructor")).toBeUndefined();
  expect(localAlertTitle("toString")).toBeUndefined();
});

test("asks for the reason of a register that can't sell, and for none of the other kinds", () => {
  expectTypeOf<{ kind: "sales_denied" }>().not.toExtend<LocalAlertSubject>();
  expectTypeOf<{ kind: "sales_denied"; reason: "unknown" }>().not.toExtend<LocalAlertSubject>();
  expectTypeOf<{ kind: "register_silent" }>().toExtend<LocalAlertSubject>();
  expectTypeOf<{
    kind: "register_silent";
    reason: "event_history_broken";
  }>().not.toExtend<LocalAlertSubject>();
});

test("knows the kinds that have a fixed text", () => {
  expect(isLocalAlertKind("register_silent")).toBe(true);
  expect(isLocalAlertKind("sales_denied")).toBe(true);
  expect(isLocalAlertKind("installation_revoked")).toBe(true);
  expect(isLocalAlertKind("serial_device_missing")).toBe(true);
});

test("does not know a kind that has none, nor a member every object has", () => {
  expect(isLocalAlertKind("update_required")).toBe(false);
  expect(isLocalAlertKind("constructor")).toBe(false);
});

test("names exactly the kinds that have a fixed text", () => {
  expectTypeOf<LocalAlertKind>().toEqualTypeOf<
    "register_silent" | "sales_denied" | "installation_revoked" | "serial_device_missing"
  >();
});
