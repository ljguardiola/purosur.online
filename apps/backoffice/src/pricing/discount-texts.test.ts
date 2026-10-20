import { describe, expect, test } from "vitest";
import { DISCOUNT_STATUS_PRESENTATION, discountValidityText } from "./discount-texts";

describe("discountValidityText", () => {
  test("leaves the year off the start when both days fall in the same year", () => {
    expect(discountValidityText("2026-09-12", "2026-09-30")).toBe("12/09 → 30/09/2026");
  });

  test("keeps the year on both days when the promotion crosses a year", () => {
    expect(discountValidityText("2026-12-01", "2027-02-28")).toBe("01/12/2026 → 28/02/2027");
  });

  test("writes a single day range in full on the end", () => {
    expect(discountValidityText("2026-03-05", "2026-03-05")).toBe("05/03 → 05/03/2026");
  });
});

describe("DISCOUNT_STATUS_PRESENTATION", () => {
  test("gives every status its label and tone", () => {
    expect(DISCOUNT_STATUS_PRESENTATION).toEqual({
      current: { label: "Vigente", tone: "success" },
      scheduled: { label: "Programada", tone: "info" },
      ended: { label: "Terminada", tone: "neutral" },
      deactivated: { label: "Desactivada", tone: "neutral" },
    });
  });
});
