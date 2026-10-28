import { expect, test } from "vitest";
import { lossCountText } from "./loss-count-text";

test("counts one loss in the singular", () => {
  expect(lossCountText(1)).toBe("1 pérdida");
});

test("counts no loss or several in the plural, with the thousands grouped", () => {
  expect(lossCountText(0)).toBe("0 pérdidas");
  expect(lossCountText(1_234)).toBe("1.234 pérdidas");
});
