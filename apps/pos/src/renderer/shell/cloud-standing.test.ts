import { describe, expect, it } from "vitest";
import { cloudStanding } from "./cloud-standing";

describe("cloudStanding", () => {
  it.each([
    ["reachable", { tone: "success", text: "Nube conectada" }],
    ["unreachable", { tone: "error", text: "Sin conexión con la nube" }],
    ["unknown", { tone: "neutral", text: "Nube sin verificar" }],
  ] as const)("tells a %s cloud", (cloud, standing) => {
    expect(cloudStanding(cloud)).toEqual(standing);
  });
});
