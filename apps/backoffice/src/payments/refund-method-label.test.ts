import { expect, test } from "vitest";
import { refundMethodLabel } from "./refund-method-label";

test.each([
  ["CASH", "Efectivo"],
  ["TRANSFER", "Transferencia"],
] as const)("names a %s refund %s", (method, label) => {
  expect(refundMethodLabel(method)).toBe(label);
});
