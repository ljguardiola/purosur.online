import { expect, test } from "vitest";
import { alertEmailOptInText } from "./alert-email-opt-in-text";

test("says that a user with no opt-in recorded does not receive alerts by email", () => {
  expect(alertEmailOptInText(null)).toBe("No recibe alertas por email");
});

test("says since which day a user receives alerts by email", () => {
  expect(alertEmailOptInText("2026-03-14T15:00:00.000Z")).toBe(
    "Recibe alertas por email desde 14/03/2026",
  );
});

test("reads the day of the opt-in in Argentina's time zone", () => {
  expect(alertEmailOptInText("2026-03-15T02:30:00.000Z")).toBe(
    "Recibe alertas por email desde 14/03/2026",
  );
});
