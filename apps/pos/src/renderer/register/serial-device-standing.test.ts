import { describe, expect, it } from "vitest";
import { serialDeviceStandingIndicator } from "./serial-device-standing";

describe("serialDeviceStandingIndicator", () => {
  it.each([
    { role: "scale", standing: "matching", tone: "success", text: "Balanza conectada" },
    { role: "scale", standing: "not_detected", tone: "error", text: "Balanza no detectada" },
    {
      role: "scale",
      standing: "mismatched",
      tone: "error",
      text: "Balanza no coincide con la registrada",
    },
    { role: "scale", standing: "not_registered", tone: "neutral", text: "Balanza sin registrar" },
    { role: "reader", standing: "matching", tone: "success", text: "Lector conectado" },
    { role: "reader", standing: "not_detected", tone: "error", text: "Lector no detectado" },
    {
      role: "reader",
      standing: "mismatched",
      tone: "error",
      text: "Lector no coincide con el registrado",
    },
    { role: "reader", standing: "not_registered", tone: "neutral", text: "Lector sin registrar" },
  ] as const)(
    "shows the $role as '$text' when it is $standing",
    ({ role, standing, tone, text }) => {
      expect(serialDeviceStandingIndicator(role, standing)).toEqual({ tone, text });
    },
  );
});
