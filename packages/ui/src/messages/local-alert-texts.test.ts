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

test("gives a register short of disk space at startup its title, the space it requires, and what to do", () => {
  expect(
    localAlertText({
      kind: "sales_denied",
      reason: "disk_space_short_at_startup",
      required_free_bytes: 12.5 * 1024 ** 3,
    }),
  ).toEqual({
    title: "La caja no puede vender: falta espacio en el disco",
    meaning:
      "Esta caja no habilita las ventas porque necesita 12,5 GB libres en el disco de la notebook y tiene menos.",
    whatToDo:
      "Liberar espacio en la notebook, borrando archivos que no sean de la caja, y reiniciar la caja.",
  });
});

test("gives a register whose disk is full its title with the space left, what it means and what to do", () => {
  expect(
    localAlertText({ kind: "sales_denied", reason: "disk_full", disk_free_ratio: 0.034 }),
  ).toEqual({
    title: "No se pueden abrir ventas nuevas: queda 3,4 % de disco",
    meaning:
      "La venta en curso se puede completar y cobrar. Para volver a vender hay que liberar espacio en la notebook.",
    whatToDo:
      "Cobrar la venta en curso y liberar espacio en la notebook, borrando archivos que no sean de la caja. Cuando haya lugar, la caja vuelve a abrir ventas sola. Si no se puede, avisar al Administrador.",
  });
});

test("shows the space left on a full disk without the float noise of a ratio", () => {
  expect(
    localAlertText({ kind: "sales_denied", reason: "disk_full", disk_free_ratio: 0.07 }).title,
  ).toBe("No se pueden abrir ventas nuevas: queda 7 % de disco");
  expect(
    localAlertText({ kind: "sales_denied", reason: "disk_full", disk_free_ratio: 0 }).title,
  ).toBe("No se pueden abrir ventas nuevas: queda 0 % de disco");
});

test("words a register short of disk space at startup without the space it requires when none is given", () => {
  expect(
    localAlertText({ kind: "sales_denied", reason: "disk_space_short_at_startup" }),
  ).toMatchObject({
    title: "La caja no puede vender: falta espacio en el disco",
    meaning:
      "Esta caja no habilita las ventas porque necesita más espacio libre en el disco de la notebook del que tiene.",
  });
});

test("words a register whose disk is full without the space left when none is given", () => {
  expect(localAlertText({ kind: "sales_denied", reason: "disk_full" })).toMatchObject({
    title: "No se pueden abrir ventas nuevas: el disco está casi lleno",
    meaning:
      "La venta en curso se puede completar y cobrar. Para volver a vender hay que liberar espacio en la notebook.",
  });
});

test("gives a register on a critically low battery its title, what it means and what to do", () => {
  expect(localAlertText({ kind: "sales_denied", reason: "battery_critical" })).toEqual({
    title: "No se pueden abrir ventas nuevas: queda poca batería",
    meaning:
      "La venta en curso se puede completar y cobrar. Después la caja envía lo pendiente y se cierra sola.",
    whatToDo: "Conectar la notebook a la corriente para seguir vendiendo.",
  });
});

test("gives a notebook running low on battery its title, the charge left and the charge that stops new sales", () => {
  expect(localAlertText({ kind: "battery_low", charge_percent: 15, critical_percent: 10 })).toEqual(
    {
      title: "Queda poca batería",
      meaning: "Queda 15 % de batería. Por debajo del 10 % no se abren ventas nuevas.",
      whatToDo: "Conectar la notebook a la corriente.",
    },
  );
  expect(localAlertTitle("battery_low")).toBe("Queda poca batería");
});

test("gives a register that has run on battery for a while its title, the minutes it has been on battery and what to do", () => {
  expect(localAlertText({ kind: "on_battery", threshold_minutes: 15 })).toEqual({
    title: "Caja funcionando a batería",
    meaning:
      "La notebook lleva más de 15 minutos sin corriente eléctrica, funcionando solo con la batería.",
    whatToDo:
      "Revisar si volvió la luz y, de poder, conectar la notebook a la corriente. Si no volvió, seguir atendiendo con normalidad y avisarle al Administrador.",
  });
  expect(localAlertTitle("on_battery")).toBe("Caja funcionando a batería");
});

test("gives a notebook that reports no battery its title, what it means and what to do", () => {
  expect(localAlertText({ kind: "battery_missing" })).toEqual({
    title: "Batería no detectada",
    meaning: "La notebook no informa tener batería conectada.",
    whatToDo:
      "Seguir vendiendo con normalidad y avisarle al Administrador para que revise el equipo.",
  });
  expect(localAlertTitle("battery_missing")).toBe("Batería no detectada");
});

test("gives a notebook whose Windows does not shut down at critical battery its title, what it means and what to do", () => {
  expect(localAlertText({ kind: "critical_battery_action_not_shutdown" })).toEqual({
    title: "Windows no apaga la notebook con batería crítica",
    meaning:
      "Si se corta la luz y la batería se agota, la notebook puede apagarse de golpe en lugar de cerrarse en orden.",
    whatToDo: "Avisar al Administrador. La ayuda de la caja explica cómo configurarlo.",
  });
  expect(localAlertTitle("critical_battery_action_not_shutdown")).toBe(
    "Windows no apaga la notebook con batería crítica",
  );
});

test("gives a register whose disk is running low its title, what it means and what to do", () => {
  expect(localAlertText({ kind: "disk_space_low" })).toEqual({
    title: "Queda poco espacio en el disco",
    meaning:
      "El disco de la notebook se está llenando. Se puede seguir vendiendo, pero si se llena la caja deja de abrir ventas nuevas.",
    whatToDo:
      "Liberar espacio en la notebook antes de que se llene, borrando archivos que no sean de la caja.",
  });
  expect(localAlertTitle("disk_space_low")).toBe("Queda poco espacio en el disco");
});

test("gives a register whose write-ahead log grew too large its title, what it means and what to do", () => {
  expect(localAlertText({ kind: "wal_oversized" })).toEqual({
    title: "El registro de cambios de la caja creció de más",
    meaning:
      "El archivo donde la caja anota sus cambios antes de guardarlos definitivamente creció más de lo normal.",
    whatToDo:
      "Se puede seguir vendiendo. Si no baja solo en un rato, reiniciar la caja y avisar al Administrador.",
  });
  expect(localAlertTitle("wal_oversized")).toBe("El registro de cambios de la caja creció de más");
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

test("gives the refund owed for a late QR payment its title, what it means and what to do", () => {
  expect(
    localAlertText({ kind: "late_payment_refund", providerOrderId: null, method: "QR" }),
  ).toEqual({
    title: "Reembolso pendiente por un pago tardío",
    meaning: "Mercado Pago cobró un QR de una venta que ya se había cobrado por otro medio.",
    whatToDo:
      "Si es de un pago con QR, confirmarlo en Reembolsos de Mercado Pago para que la nube lo envíe a Mercado Pago; si es de otro medio y ya se hizo desde Mercado Pago, marcarlo como hecho en Reembolsos sin API, y si todavía no se hizo, hacerlo cuanto antes. Si no corresponde reembolsarlo, descartarlo. El Administrador ya fue avisado.",
  });
});

test("tells the refund owed for a second paid order of a sale's QR that the QR was paid twice, naming that order", () => {
  expect(
    localAlertText({ kind: "late_payment_refund", providerOrderId: "ORD01SECOND", method: "QR" }),
  ).toEqual({
    title: "Reembolso pendiente por un pago tardío",
    meaning:
      "El QR de una venta se pagó dos veces; el pago de más es el de la orden ORD01SECOND de Mercado Pago.",
    whatToDo:
      "Si es de un pago con QR, confirmarlo en Reembolsos de Mercado Pago para que la nube lo envíe a Mercado Pago; si es de otro medio y ya se hizo desde Mercado Pago, marcarlo como hecho en Reembolsos sin API, y si todavía no se hizo, hacerlo cuanto antes. Si no corresponde reembolsarlo, descartarlo. El Administrador ya fue avisado.",
  });
});

test("gives the refund owed for a late Point payment its title, what it means and what to do", () => {
  expect(
    localAlertText({ kind: "late_payment_refund", providerOrderId: null, method: "POINT" }),
  ).toEqual({
    title: "Reembolso pendiente por un pago tardío",
    meaning:
      "Mercado Pago cobró un pago con tarjeta en el Point de una venta que ya se había cobrado por otro medio.",
    whatToDo:
      "Confirmarlo en Reembolsos de Mercado Pago para que la nube lo envíe a Mercado Pago. Si no corresponde reembolsarlo, descartarlo. El Administrador ya fue avisado.",
  });
});

test("tells the refund owed for a second paid order of a sale's Point payment that it was paid twice, naming that order", () => {
  expect(
    localAlertText({
      kind: "late_payment_refund",
      providerOrderId: "ORD01SECOND",
      method: "POINT",
    }),
  ).toEqual({
    title: "Reembolso pendiente por un pago tardío",
    meaning:
      "Una venta se cobró dos veces con tarjeta en el Point; el pago de más es el de la orden ORD01SECOND de Mercado Pago.",
    whatToDo:
      "Confirmarlo en Reembolsos de Mercado Pago para que la nube lo envíe a Mercado Pago. Si no corresponde reembolsarlo, descartarlo. El Administrador ya fue avisado.",
  });
});

test("gives the refund of a cancelled sale left pending its title, what it means and what to do", () => {
  expect(localAlertText({ kind: "refund_task" })).toEqual({
    title: "Reembolso pendiente de confirmar",
    meaning: "Hay un reembolso de una venta anulada o cancelada que todavía no se completó.",
    whatToDo:
      "Si es de un pago con QR o Point, confirmarlo en Reembolsos de Mercado Pago para que la nube lo envíe; si Mercado Pago ya lo rechazó, descartarlo ahí. Si es de otro medio, hacerlo por fuera del sistema cuanto antes y marcarlo como hecho en Reembolsos sin API. El Administrador ya fue avisado.",
  });
  expect(localAlertTitle("refund_task")).toBe("Reembolso pendiente de confirmar");
});

test("gives a register whose fiscal emission is stopped its title, what it means and what to do", () => {
  expect(localAlertText({ kind: "fiscal_emission_stopped" })).toEqual({
    title: "Emisión de facturas detenida",
    meaning:
      "Esta caja no puede emitir ningún comprobante fiscal por ahora, ni siquiera el de contingencia.",
    whatToDo:
      "Seguir vendiendo igual: se cobra la venta, se entrega al cliente el papel que indica que todavía no es la factura y que debe conservarlo, y la factura se emite sola más adelante. El Administrador ya fue avisado.",
  });
  expect(localAlertTitle("fiscal_emission_stopped")).toBe("Emisión de facturas detenida");
});

test("gives a register whose clock is off its title, what it means and what to do, without promising a block", () => {
  expect(localAlertText({ kind: "clock_drift" })).toEqual({
    title: "Reloj de la caja desajustado",
    meaning:
      "La hora de esta caja está corrida más de un minuto respecto de la hora real, y los comprobantes salen con la hora de la caja.",
    whatToDo:
      "Seguir vendiendo con normalidad. Corregir la fecha y hora de Windows o avisar al Administrador, que ya fue notificado.",
  });
  expect(localAlertTitle("clock_drift")).toBe("Reloj de la caja desajustado");
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
  expectTypeOf<{ kind: "sales_denied"; reason: "disk_full" }>().toExtend<LocalAlertSubject>();
  expectTypeOf<{
    kind: "sales_denied";
    reason: "disk_full";
    disk_free_ratio: number;
  }>().toExtend<LocalAlertSubject>();
  expectTypeOf<{
    kind: "sales_denied";
    reason: "disk_space_short_at_startup";
  }>().toExtend<LocalAlertSubject>();
  expectTypeOf<{
    kind: "sales_denied";
    reason: "disk_space_short_at_startup";
    required_free_bytes: number;
  }>().toExtend<LocalAlertSubject>();
  expectTypeOf<{
    kind: "sales_denied";
    reason: "battery_critical";
  }>().toExtend<LocalAlertSubject>();
  expectTypeOf<{ kind: "battery_low" }>().not.toExtend<LocalAlertSubject>();
  expectTypeOf<{
    kind: "battery_low";
    charge_percent: number;
    critical_percent: number;
  }>().toExtend<LocalAlertSubject>();
  expectTypeOf<{ kind: "on_battery" }>().not.toExtend<LocalAlertSubject>();
  expectTypeOf<{ kind: "on_battery"; threshold_minutes: number }>().toExtend<LocalAlertSubject>();
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
  expect(isLocalAlertKind("late_payment_refund")).toBe(true);
  expect(isLocalAlertKind("refund_task")).toBe(true);
  expect(isLocalAlertKind("fiscal_emission_stopped")).toBe(true);
  expect(isLocalAlertKind("clock_drift")).toBe(true);
  expect(isLocalAlertKind("disk_space_low")).toBe(true);
  expect(isLocalAlertKind("wal_oversized")).toBe(true);
  expect(isLocalAlertKind("battery_low")).toBe(true);
  expect(isLocalAlertKind("on_battery")).toBe(true);
  expect(isLocalAlertKind("battery_missing")).toBe(true);
  expect(isLocalAlertKind("critical_battery_action_not_shutdown")).toBe(true);
});

test("does not know a kind that has none, nor a member every object has", () => {
  expect(isLocalAlertKind("update_required")).toBe(false);
  expect(isLocalAlertKind("constructor")).toBe(false);
});

test("names exactly the kinds that have a fixed text", () => {
  expectTypeOf<LocalAlertKind>().toEqualTypeOf<
    | "register_silent"
    | "sales_denied"
    | "installation_revoked"
    | "serial_device_missing"
    | "late_payment_refund"
    | "refund_task"
    | "fiscal_emission_stopped"
    | "clock_drift"
    | "disk_space_low"
    | "wal_oversized"
    | "battery_low"
    | "on_battery"
    | "battery_missing"
    | "critical_battery_action_not_shutdown"
  >();
});
