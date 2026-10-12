import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS } from "./mercado-pago-point-order.js";
import {
  POINT_TERMINAL_AVAILABILITIES,
  pointTerminalAvailability,
  QR_AVAILABILITIES,
  qrAvailability,
} from "./payment-method-availability.js";

describe("qrAvailability", () => {
  it("is available while the cloud is reachable", () => {
    expect(qrAvailability(true)).toBe("available");
  });

  it("is offline while the cloud is not reachable", () => {
    expect(qrAvailability(false)).toBe("offline");
  });
});

describe("pointTerminalAvailability", () => {
  it("is available with the cloud reachable and a balance that reaches the minimum", () => {
    expect(pointTerminalAvailability(true, MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS)).toBe(
      "available",
    );
  });

  it("is below the minimum when the balance is one cent short", () => {
    expect(pointTerminalAvailability(true, MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS - 1)).toBe(
      "below_minimum",
    );
  });

  it("is offline when the cloud is not reachable, whatever the balance", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        (pending) => pointTerminalAvailability(false, pending) === "offline",
      ),
    );
  });

  it("is below the minimum for any balance under it with the cloud reachable", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS - 1 }),
        (pending) => pointTerminalAvailability(true, pending) === "below_minimum",
      ),
    );
  });
});

describe("POINT_TERMINAL_AVAILABILITIES", () => {
  it("lists what the cloud can report about the terminal besides what the register works out", () => {
    expect(POINT_TERMINAL_AVAILABILITIES).toEqual([
      "available",
      "offline",
      "below_minimum",
      "not_configured",
    ]);
  });
});

describe("QR_AVAILABILITIES", () => {
  it("lists what the register works out about the QR", () => {
    expect(QR_AVAILABILITIES).toEqual(["available", "offline"]);
  });
});
