import { expect, test } from "vitest";
import { revokedInstallationDayAndTime } from "./revoked-installation-moments";

test("writes the instant an installation was revoked as its Argentine day and time", () => {
  expect(revokedInstallationDayAndTime("2026-09-10T15:30:00.000Z")).toBe("10/09/2026 · 12:30");
});

test("writes an instant as its Argentine day even when UTC is already the next day", () => {
  expect(revokedInstallationDayAndTime("2026-09-14T01:30:00.000Z")).toBe("13/09/2026 · 22:30");
});
