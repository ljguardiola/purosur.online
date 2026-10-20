import type { PaymentMethodAvailability } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { chargeMethodOptions } from "./charge-method-options";

const AVAILABLE: PaymentMethodAvailability = {
  qr: "available",
  point: "available",
  point_minimum: 1500,
};

function loaded(availability: Partial<PaymentMethodAvailability> = {}) {
  return chargeMethodOptions({
    status: "loaded",
    value: { ...AVAILABLE, ...availability },
    refreshing: false,
  });
}

function shown(options: ReturnType<typeof chargeMethodOptions>["options"]) {
  return options.map(({ value, description, disabled }) => ({
    value,
    description,
    disabled: disabled ?? false,
  }));
}

describe("chargeMethodOptions", () => {
  it("offers cash, the terminal, the QR, transfer and the standalone terminal, in that order, when every method is available", () => {
    const { options, belowMinimum } = loaded();

    expect(shown(options)).toEqual([
      { value: "CASH", description: "Cargás lo entregado y ves el vuelto", disabled: false },
      {
        value: "POINT",
        description: "Tarjeta o QR en la terminal · requiere internet",
        disabled: false,
      },
      { value: "QR", description: "El cliente escanea el QR · requiere internet", disabled: false },
      {
        value: "TRANSFER",
        description: "Confirmás al ver el ingreso en la cuenta del negocio",
        disabled: false,
      },
      {
        value: "STANDALONE_TERMINAL",
        description: "Segunda Point · cargás el resultado a mano",
        disabled: false,
      },
    ]);
    expect(belowMinimum).toBeUndefined();
  });

  it("shows the terminal and the QR as unavailable without a connection", () => {
    const { options } = loaded({ qr: "offline", point: "offline" });

    expect(shown(options).filter(({ disabled }) => disabled)).toEqual([
      { value: "POINT", description: "No disponible sin conexión", disabled: true },
      { value: "QR", description: "No disponible sin conexión", disabled: true },
    ]);
  });

  it("shows the terminal as not configured on the register, disabled, while keeping the QR available", () => {
    const { options } = loaded({ point: "not_configured" });

    expect(shown(options).filter(({ disabled }) => disabled)).toEqual([
      { value: "POINT", description: "No configurada en esta caja", disabled: true },
    ]);
  });

  it("shows the QR as not configured on the register, disabled, while keeping the terminal available", () => {
    const { options } = loaded({ qr: "not_configured" });

    expect(shown(options).filter(({ disabled }) => disabled)).toEqual([
      { value: "QR", description: "No configurado en esta caja", disabled: true },
    ]);
  });

  it("keeps the standalone terminal enabled when the integrated methods are offline", () => {
    const { options } = loaded({ qr: "offline", point: "offline" });

    expect(shown(options).find(({ value }) => value === "STANDALONE_TERMINAL")?.disabled).toBe(
      false,
    );
  });

  it("leaves the terminal out below its minimum and names that minimum", () => {
    const { options, belowMinimum } = loaded({ point: "below_minimum" });

    expect(options.map(({ value }) => value)).toEqual([
      "CASH",
      "QR",
      "TRANSFER",
      "STANDALONE_TERMINAL",
    ]);
    expect(belowMinimum).toBe(1500);
  });

  it.each([
    ["is still loading", { status: "loading" }],
    ["could not be read", { status: "failed", retry: () => undefined }],
  ] as const)(
    "offers cash, transfer and the standalone terminal while the availability %s",
    (_state, availability) => {
      const { options, belowMinimum } = chargeMethodOptions(availability);

      expect(options.map(({ value }) => value)).toEqual([
        "CASH",
        "TRANSFER",
        "STANDALONE_TERMINAL",
      ]);
      expect(belowMinimum).toBeUndefined();
    },
  );
});
