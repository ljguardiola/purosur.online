import { expect, test } from "vitest";
import { refundOriginLabel } from "./refund-origin-label";

test.each([
  ["sale_cancelled", "Venta cancelada"],
  ["late_payment", "Pago QR tardío"],
] as const)("names a %s refund %s", (origin, label) => {
  expect(refundOriginLabel(origin)).toBe(label);
});
