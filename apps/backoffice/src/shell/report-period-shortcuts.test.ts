import { expect, test } from "vitest";
import { periodOfShortcut, shortcutOfPeriod } from "./report-period-shortcuts";

test("takes today as a period of that single day", () => {
  expect(periodOfShortcut("today", "2026-10-15")).toEqual({ from: "2026-10-15", to: "2026-10-15" });
});

test("takes the last seven days as the seven days ending today", () => {
  expect(periodOfShortcut("last-7-days", "2026-10-15")).toEqual({
    from: "2026-10-09",
    to: "2026-10-15",
  });
  expect(periodOfShortcut("last-7-days", "2026-03-03")).toEqual({
    from: "2026-02-25",
    to: "2026-03-03",
  });
});

test("takes this month from its first day through today", () => {
  expect(periodOfShortcut("this-month", "2026-10-15")).toEqual({
    from: "2026-10-01",
    to: "2026-10-15",
  });
  expect(periodOfShortcut("this-month", "2026-10-01")).toEqual({
    from: "2026-10-01",
    to: "2026-10-01",
  });
});

test("takes the previous month as that whole calendar month", () => {
  expect(periodOfShortcut("previous-month", "2026-03-31")).toEqual({
    from: "2026-02-01",
    to: "2026-02-28",
  });
  expect(periodOfShortcut("previous-month", "2028-03-10")).toEqual({
    from: "2028-02-01",
    to: "2028-02-29",
  });
  expect(periodOfShortcut("previous-month", "2027-01-05")).toEqual({
    from: "2026-12-01",
    to: "2026-12-31",
  });
});

test("names the shortcut whose period is shown", () => {
  const today = "2026-10-15";

  expect(shortcutOfPeriod({ from: "2026-10-15", to: "2026-10-15" }, today)).toBe("today");
  expect(shortcutOfPeriod({ from: "2026-10-09", to: "2026-10-15" }, today)).toBe("last-7-days");
  expect(shortcutOfPeriod({ from: "2026-10-01", to: "2026-10-15" }, today)).toBe("this-month");
  expect(shortcutOfPeriod({ from: "2026-09-01", to: "2026-09-30" }, today)).toBe("previous-month");
});

test("names no shortcut for a period none of them gives", () => {
  expect(shortcutOfPeriod({ from: "2026-10-02", to: "2026-10-15" }, "2026-10-15")).toBeNull();
  expect(shortcutOfPeriod({ from: "2026-10-14", to: "2026-10-14" }, "2026-10-15")).toBeNull();
});

test("names today on the first of the month, when this month gives the same period", () => {
  expect(shortcutOfPeriod({ from: "2026-10-01", to: "2026-10-01" }, "2026-10-01")).toBe("today");
});
