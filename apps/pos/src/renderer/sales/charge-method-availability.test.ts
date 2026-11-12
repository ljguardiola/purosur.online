import type { PaymentMethodAvailability } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { chargeMethodAvailability } from "./charge-method-availability";

const AVAILABLE: PaymentMethodAvailability = {
  qr: "available",
  point: "available",
  point_minimum: 1500,
  qr_minimum: 2000,
};

const OFFERED = { kind: "offered" } as const;

function locked(reason: string) {
  return { kind: "locked", reason } as const;
}

function loaded(availability: Partial<PaymentMethodAvailability> = {}) {
  return chargeMethodAvailability({
    status: "loaded",
    value: { ...AVAILABLE, ...availability },
    refreshing: false,
  });
}

describe("chargeMethodAvailability", () => {
  it("offers every method when every method is available", () => {
    expect(loaded()).toEqual({
      CASH: OFFERED,
      POINT_DEBIT: OFFERED,
      POINT_CREDIT: OFFERED,
      QR: OFFERED,
      TRANSFER: OFFERED,
      STANDALONE_TERMINAL: OFFERED,
    });
  });

  it("locks the terminal and the QR without connection, saying so", () => {
    const methods = loaded({ qr: "offline", point: "offline" });

    expect(methods.POINT_DEBIT).toEqual(locked("No disponible sin conexión"));
    expect(methods.POINT_CREDIT).toEqual(locked("No disponible sin conexión"));
    expect(methods.QR).toEqual(locked("No disponible sin conexión"));
  });

  it("locks the terminal when this register has none configured, saying so", () => {
    const methods = loaded({ point: "not_configured" });

    expect(methods.POINT_DEBIT).toEqual(locked("No configurada en esta caja"));
    expect(methods.POINT_CREDIT).toEqual(locked("No configurada en esta caja"));
    expect(methods.QR).toEqual(OFFERED);
  });

  it("locks the QR when this register has none configured, saying so", () => {
    const methods = loaded({ qr: "not_configured" });

    expect(methods.QR).toEqual(locked("No configurado en esta caja"));
    expect(methods.POINT_DEBIT).toEqual(OFFERED);
  });

  it("locks the QR below its minimum, naming that minimum", () => {
    expect(loaded({ qr: "below_minimum" }).QR).toEqual(
      locked("No se ofrece para cobrar menos de $ 20,00"),
    );
  });

  it("locks the terminal below its minimum, naming that minimum", () => {
    const methods = loaded({ point: "below_minimum" });

    expect(methods.POINT_DEBIT).toEqual(locked("No se ofrece para cobrar menos de $ 15,00"));
    expect(methods.POINT_CREDIT).toEqual(locked("No se ofrece para cobrar menos de $ 15,00"));
  });

  it.each(["offline", "not_configured", "below_minimum"] as const)(
    "keeps the methods that need no connection offered when the terminal and the QR are %s",
    (state) => {
      const methods = loaded({ qr: state, point: state });

      expect([methods.CASH, methods.TRANSFER, methods.STANDALONE_TERMINAL]).toEqual([
        OFFERED,
        OFFERED,
        OFFERED,
      ]);
    },
  );

  it.each([
    ["is still loading", { status: "loading" }],
    ["could not be read", { status: "failed", retry: () => undefined }],
  ] as const)(
    "offers only cash, transfer and the standalone terminal, leaving the terminal and the QR out, while the availability %s",
    (_state, availability) => {
      expect(chargeMethodAvailability(availability)).toEqual({
        CASH: OFFERED,
        TRANSFER: OFFERED,
        STANDALONE_TERMINAL: OFFERED,
      });
    },
  );
});
