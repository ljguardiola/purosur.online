import { describe, expect, test } from "vitest";
import {
  invariantViolationDescription,
  quarantinedEventsDescription,
} from "./synced-event-alert-description";

describe("the description of a register with quarantined events", () => {
  test("names the register and says its later events wait", () => {
    expect(quarantinedEventsDescription("Caja 1")).toBe(
      "La caja «Caja 1» tiene eventos que no se pudieron aplicar y quedaron en cuarentena. Los eventos siguientes de cada uno de esos registros esperan hasta que se resuelvan.",
    );
  });

  test("speaks of a register in general words when it has no name", () => {
    expect(quarantinedEventsDescription(null)).toBe(
      "Una caja tiene eventos que no se pudieron aplicar y quedaron en cuarentena. Los eventos siguientes de cada uno de esos registros esperan hasta que se resuelvan.",
    );
  });
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

  test("says the stock movements of a sale do not match its lines", () => {
    expect(
      invariantViolationDescription({
        ...violation,
        breaks: ["stock_movements_do_not_match_lines"],
      }),
    ).toBe(
      "Se aplicó el evento de venta (event-1) de la venta sale-1, pero tiene una inconsistencia: los movimientos de stock no coinciden con los productos vendidos.",
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
