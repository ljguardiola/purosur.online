import { expect, test } from "vitest";
import { recoveryAwaitingSinceText } from "./ticket-recovery-text";

test("writes the moment the recovery was opened as the store's day and time", () => {
  expect(recoveryAwaitingSinceText("2026-09-14T20:22:00.000Z")).toBe("14/09/2026 · 17:22");
});

test("writes the store's day when it differs from the UTC day", () => {
  expect(recoveryAwaitingSinceText("2026-09-15T01:30:00.000Z")).toBe("14/09/2026 · 22:30");
});
