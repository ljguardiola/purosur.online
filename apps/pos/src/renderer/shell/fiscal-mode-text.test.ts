import { expect, it } from "vitest";
import { fiscalModeText } from "./fiscal-mode-text";

it("names the contingency by its kind", () => {
  expect(fiscalModeText("offline_code")).toBe("Contingencia CAEA");
  expect(fiscalModeText("deferring")).toBe("Venta diferida");
});
