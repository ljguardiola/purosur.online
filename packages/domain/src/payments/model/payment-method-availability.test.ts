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
  it("is available with a QR point of sale assigned and the cloud reachable", () => {
    expect(qrAvailability({ pointOfSaleAssigned: true, cloudReachable: true })).toBe("available");
  });

  it("is offline with a QR point of sale assigned and the cloud not reachable", () => {
    expect(qrAvailability({ pointOfSaleAssigned: true, cloudReachable: false })).toBe("offline");
  });

  it("is not configured when the register has no QR point of sale assigned, whatever the cloud", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (cloudReachable) =>
          qrAvailability({ pointOfSaleAssigned: false, cloudReachable }) === "not_configured",
      ),
    );
  });
});

describe("pointTerminalAvailability", () => {
  const reachableWithTerminal = { terminalAssigned: true, cloudReachable: true };

  it("is available with a terminal assigned, the cloud reachable and a balance that reaches the minimum", () => {
    expect(
      pointTerminalAvailability({
        ...reachableWithTerminal,
        pendingCents: MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS,
      }),
    ).toBe("available");
  });

  it("is below the minimum when the balance is one cent short", () => {
    expect(
      pointTerminalAvailability({
        ...reachableWithTerminal,
        pendingCents: MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS - 1,
      }),
    ).toBe("below_minimum");
  });

  it("is offline when the cloud is not reachable, whatever the balance", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        (pendingCents) =>
          pointTerminalAvailability({
            terminalAssigned: true,
            cloudReachable: false,
            pendingCents,
          }) === "offline",
      ),
    );
  });

  it("is below the minimum for any balance under it with the cloud reachable", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS - 1 }),
        (pendingCents) =>
          pointTerminalAvailability({ ...reachableWithTerminal, pendingCents }) === "below_minimum",
      ),
    );
  });

  it("is not configured when the register has no terminal assigned, whatever the cloud and the balance", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        (cloudReachable, pendingCents) =>
          pointTerminalAvailability({ terminalAssigned: false, cloudReachable, pendingCents }) ===
          "not_configured",
      ),
    );
  });
});

describe("POINT_TERMINAL_AVAILABILITIES", () => {
  it("lists what the register works out about the terminal", () => {
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
    expect(QR_AVAILABILITIES).toEqual(["available", "offline", "not_configured"]);
  });
});
