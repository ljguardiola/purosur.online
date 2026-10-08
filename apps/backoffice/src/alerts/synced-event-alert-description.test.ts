import { describe, expect, test } from "vitest";
import {
  invariantViolationDescription,
  quarantinedEventDescription,
} from "./synced-event-alert-description";

const saleEvent = {
  deviceId: "device-1",
  eventId: "event-1",
  eventType: "sale_completed",
  aggregateType: "Sale",
  aggregateId: "sale-1",
};

describe("the description of a quarantined event", () => {
  test("names the cash session it waits for", () => {
    expect(
      quarantinedEventDescription({
        ...saleEvent,
        reason: {
          kind: "missing_dependency",
          aggregateType: "CashSession",
          aggregateId: "session-1",
        },
      }),
    ).toBe(
      "El evento de venta (event-1) de la venta sale-1 no se pudo aplicar y quedó en cuarentena: depende de la sesión de caja session-1, que todavía no se aplicó. Los eventos siguientes de la venta sale-1 esperan hasta que se resuelva.",
    );
  });

  test("says the cloud could not read an event it cannot read", () => {
    expect(quarantinedEventDescription({ ...saleEvent, reason: { kind: "unreadable" } })).toBe(
      "El evento de venta (event-1) de la venta sale-1 no se pudo aplicar y quedó en cuarentena: la nube no puede leer lo que envió la caja. Los eventos siguientes de la venta sale-1 esperan hasta que se resuelva.",
    );
  });

  test("says the cloud could not save an event it could not record", () => {
    expect(quarantinedEventDescription({ ...saleEvent, reason: { kind: "not_recorded" } })).toBe(
      "El evento de venta (event-1) de la venta sale-1 no se pudo aplicar y quedó en cuarentena: la nube no lo pudo guardar. Los eventos siguientes de la venta sale-1 esperan hasta que se resuelva.",
    );
  });

  test.each([
    ["cash_session_opened", "apertura de caja"],
    ["cash_session_closed", "cierre de caja"],
    ["cash_movement_recorded", "movimiento de caja"],
    ["fiscal_gate_failed", "control fiscal previo a facturar"],
    ["sale_cancelled", "venta cancelada"],
  ])("names a %s event as one of %s", (eventType, name) => {
    expect(
      quarantinedEventDescription({
        ...saleEvent,
        eventType,
        aggregateType: "CashSession",
        aggregateId: "session-1",
        reason: { kind: "not_recorded" },
      }),
    ).toBe(
      `El evento de ${name} (event-1) de la sesión de caja session-1 no se pudo aplicar y quedó en cuarentena: la nube no lo pudo guardar. Los eventos siguientes de la sesión de caja session-1 esperan hasta que se resuelva.`,
    );
  });

  test("names an event type and a record type it does not know in general words, never by their codes", () => {
    expect(
      quarantinedEventDescription({
        ...saleEvent,
        eventType: "return_completed",
        aggregateType: "Return",
        aggregateId: "return-1",
        reason: { kind: "missing_dependency", aggregateType: "Layaway", aggregateId: "layaway-1" },
      }),
    ).toBe(
      "El evento (event-1) del registro return-1 no se pudo aplicar y quedó en cuarentena: depende del registro layaway-1, que todavía no se aplicó. Los eventos siguientes del registro return-1 esperan hasta que se resuelva.",
    );
  });

  test.each(["constructor", "toString", "__proto__"])(
    "names an event type and record types called %s in general words",
    (code) => {
      expect(
        quarantinedEventDescription({
          ...saleEvent,
          eventType: code,
          aggregateType: code,
          aggregateId: "record-1",
          reason: { kind: "missing_dependency", aggregateType: code, aggregateId: "record-2" },
        }),
      ).toBe(
        "El evento (event-1) del registro record-1 no se pudo aplicar y quedó en cuarentena: depende del registro record-2, que todavía no se aplicó. Los eventos siguientes del registro record-1 esperan hasta que se resuelva.",
      );
    },
  );
});

describe("the description of an event applied with an inconsistency", () => {
  const violation = {
    eventId: "event-1",
    eventType: "sale_completed",
    aggregateType: "Sale",
    aggregateId: "sale-1",
  };

  test("says what the inconsistency is", () => {
    expect(
      invariantViolationDescription({ ...violation, breaks: ["approved_payments_below_total"] }),
    ).toBe(
      "Se aplicó el evento de venta (event-1) de la venta sale-1, pero tiene una inconsistencia: los pagos aprobados no cubren el total de la venta.",
    );
  });

  test("says the refunds of a cancelled sale do not match its payments", () => {
    expect(
      invariantViolationDescription({
        ...violation,
        eventType: "sale_cancelled",
        breaks: ["refunds_do_not_match_payments"],
      }),
    ).toBe(
      "Se aplicó el evento de venta cancelada (event-1) de la venta sale-1, pero tiene una inconsistencia: los reembolsos no coinciden con los pagos de la venta.",
    );
  });

  test("names an inconsistency it does not know in general words, once, never by its code", () => {
    expect(
      invariantViolationDescription({
        ...violation,
        breaks: ["approved_payments_below_total", "other_break", "another_break"],
      }),
    ).toBe(
      "Se aplicó el evento de venta (event-1) de la venta sale-1, pero tiene una inconsistencia: los pagos aprobados no cubren el total de la venta y otra inconsistencia.",
    );
  });

  test.each(["constructor", "toString", "__proto__"])(
    "names an inconsistency called %s in general words",
    (code) => {
      expect(invariantViolationDescription({ ...violation, breaks: [code] })).toBe(
        "Se aplicó el evento de venta (event-1) de la venta sale-1, pero tiene una inconsistencia: otra inconsistencia.",
      );
    },
  );
});
