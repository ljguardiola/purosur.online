import { expect, test } from "vitest";
import { formatDisplayDate } from "./display-date";

test("writes a calendar day as dd/mm/aaaa, whatever the time zone of the machine", () => {
  expect(formatDisplayDate("2019-03-01")).toBe("01/03/2019");
  expect(formatDisplayDate("2026-12-31")).toBe("31/12/2026");
});
