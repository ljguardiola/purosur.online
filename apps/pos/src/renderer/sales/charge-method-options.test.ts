import type { PaymentMethodAvailability } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { chargeMethodAvailability } from "./charge-method-options";

const AVAILABLE: PaymentMethodAvailability = {
  qr: "available",
  point: "available",
  point_minimum: 1500,
  qr_minimum: 1500,
};

function loaded(availability: Partial<PaymentMethodAvailability> = {}) {
  return chargeMethodAvailability({
    status: "loaded",
    value: { ...AVAILABLE, ...availability },
    refreshing: false,
  });
}

describe("chargeMethodAvailability", () => {
  it("enables every method when every method is available", () => {
    const { enabled, belowMinimum } = loaded();

    expect([...enabled].sort()).toEqual(
      ["CASH", "POINT_CREDIT", "POINT_DEBIT", "QR", "STANDALONE_TERMINAL", "TRANSFER"].sort(),
    );
    expect(belowMinimum).toBeUndefined();
  });

  it.each(["offline", "not_configured"] as const)(
    "disables the terminal and the QR when they are %s, keeping the methods that need no connection",
    (state) => {
      const { enabled } = loaded({ qr: state, point: state });

      expect([...enabled].sort()).toEqual(["CASH", "STANDALONE_TERMINAL", "TRANSFER"]);
    },
  );

  it("disables only the QR when it is not configured", () => {
    const { enabled } = loaded({ qr: "not_configured" });

    expect(enabled.has("QR")).toBe(false);
    expect(enabled.has("POINT_DEBIT")).toBe(true);
    expect(enabled.has("POINT_CREDIT")).toBe(true);
  });

  it("disables only the terminal when it is not configured", () => {
    const { enabled } = loaded({ point: "not_configured" });

    expect(enabled.has("QR")).toBe(true);
    expect(enabled.has("POINT_DEBIT")).toBe(false);
    expect(enabled.has("POINT_CREDIT")).toBe(false);
  });

  it("disables the QR below its minimum", () => {
    const { enabled } = loaded({ qr: "below_minimum" });

    expect(enabled.has("QR")).toBe(false);
  });

  it("disables the terminal below its minimum and names that minimum", () => {
    const { enabled, belowMinimum } = loaded({ point: "below_minimum" });

    expect(enabled.has("POINT_DEBIT")).toBe(false);
    expect(enabled.has("POINT_CREDIT")).toBe(false);
    expect(belowMinimum).toBe(1500);
  });

  it.each([
    ["is still loading", { status: "loading" }],
    ["could not be read", { status: "failed", retry: () => undefined }],
  ] as const)(
    "enables cash, transfer and the standalone terminal while the availability %s",
    (_state, availability) => {
      const { enabled, belowMinimum } = chargeMethodAvailability(availability);

      expect([...enabled].sort()).toEqual(["CASH", "STANDALONE_TERMINAL", "TRANSFER"]);
      expect(belowMinimum).toBeUndefined();
    },
  );
});
