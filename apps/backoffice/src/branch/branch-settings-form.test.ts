import { BRANCH_HOURS_RANGES_PER_DAY_MAX, BRANCH_SETTINGS_DAYS_MAX } from "@purosur/domain";
import { expect, test } from "vitest";
import { type DayValues, EMPTY_VALUES, MESSAGES } from "./branch-settings-form";

function daysMessage(days: string): string {
  return MESSAGES.unreviewedPriceAlertDays({ ...EMPTY_VALUES, unreviewedPriceAlertDays: days });
}

function hoursMessage(...ranges: [opensAt: string, closesAt: string][]): string {
  const monday: DayValues = {
    closed: false,
    ranges: ranges.map(([opensAt, closesAt], id) => ({ id, opensAt, closesAt })),
  };
  return MESSAGES.monday({ ...EMPTY_VALUES, monday });
}

test("asks for fewer days for a days value over the maximum", () => {
  expect(daysMessage(String(BRANCH_SETTINGS_DAYS_MAX + 1))).toBe(
    "Ingresá un número de días más chico.",
  );
});

test("asks for fewer days for digits too many to be read as a number", () => {
  expect(daysMessage("9".repeat(400))).toBe("Ingresá un número de días más chico.");
});

test("asks for a whole number of 0 or more for a negative days value", () => {
  expect(daysMessage("-1")).toBe("Ingresá un número entero de 0 días o más.");
});

test("asks for a whole number of 0 or more for a days value that is not whole", () => {
  expect(daysMessage("1.5")).toBe("Ingresá un número entero de 0 días o más.");
});

test("asks for a whole number of 0 or more for an empty days value", () => {
  expect(daysMessage(" ")).toBe("Ingresá un número entero de 0 días o más.");
});

test("asks to review a days value the shape accepts", () => {
  expect(daysMessage(` ${BRANCH_SETTINGS_DAYS_MAX} `)).toBe("Revisá el número de días.");
});

test("asks for the hour format for a time not written as hours and minutes", () => {
  expect(hoursMessage(["9", "13:00"])).toBe("Ingresá la hora como 9:00 o 21:30.");
});

test("asks for the hour format before the order of another range", () => {
  expect(hoursMessage(["9", "13:00"], ["18:00", "14:00"])).toBe(
    "Ingresá la hora como 9:00 o 21:30.",
  );
});

test("asks for a closing hour later than the opening one", () => {
  expect(hoursMessage(["13:00", "9:00"])).toBe(
    "La hora de cierre tiene que ser posterior a la de apertura.",
  );
});

test("asks for a closing hour later than the opening one before an overlap", () => {
  expect(hoursMessage(["9:00", "13:00"], ["12:00", "10:00"])).toBe(
    "La hora de cierre tiene que ser posterior a la de apertura.",
  );
});

test("refuses ranges of one day that overlap", () => {
  expect(hoursMessage(["9:00", "13:00"], ["12:00", "18:00"])).toBe(
    "Los horarios de un mismo día no se pueden superponer.",
  );
});

test("asks to review the hours of a day with more ranges than allowed", () => {
  const ranges = Array.from(
    { length: BRANCH_HOURS_RANGES_PER_DAY_MAX + 1 },
    (_, hour): [string, string] => [`${hour}:00`, `${hour}:30`],
  );

  expect(hoursMessage(...ranges)).toBe("Revisá los horarios de este día.");
});
