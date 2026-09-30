import { describe, expect, test } from "vitest";
import {
  DISCOUNT_STATUS_PRESENTATION,
  discountBenefitText,
  discountTargetLine,
  discountValidityText,
  weekdaysText,
} from "./discount-texts";

describe("discountBenefitText", () => {
  test("writes the percentage off with a spaced percent sign", () => {
    expect(discountBenefitText({ kind: "PERCENT_OFF", percent: 15 })).toBe("15 % de descuento");
  });

  test("writes how many units are bought and how many are paid", () => {
    expect(discountBenefitText({ kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 })).toBe(
      "Lleve 3, pague 2",
    );
  });

  test("writes large quantities with the Argentine thousands separator", () => {
    expect(discountBenefitText({ kind: "BUY_N_PAY_M", buyQty: 1200, payQty: 1000 })).toBe(
      "Lleve 1.200, pague 1.000",
    );
  });
});

describe("discountTargetLine", () => {
  test.each([
    [{ kind: "PRODUCT", name: "Yerba Playadito 1 kg" }, "Producto · Yerba Playadito 1 kg"],
    [{ kind: "CATEGORY", name: "Almacén › Yerbas" }, "Categoría · Almacén › Yerbas"],
    [{ kind: "TAG", name: "Sin TACC" }, "Distintivo · Sin TACC"],
  ] as const)("names the kind of %j before the target", (target, line) => {
    expect(discountTargetLine(target)).toBe(line);
  });
});

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

describe("weekdaysText", () => {
  test("says every day when no weekday is marked", () => {
    expect(weekdaysText([])).toBe("Todos los días");
  });

  test("says every day when all seven are marked", () => {
    expect(weekdaysText([1, 2, 3, 4, 5, 6, 7])).toBe("Todos los días");
  });

  test("names a single weekday capitalized", () => {
    expect(weekdaysText([2])).toBe("Martes");
  });

  test("lists several weekdays in week order joined with y", () => {
    expect(weekdaysText([5, 1, 3])).toBe("Lunes, miércoles y viernes");
  });

  test("joins two weekdays with y", () => {
    expect(weekdaysText([6, 7])).toBe("Sábado y domingo");
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
