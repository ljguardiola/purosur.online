import { expect, test } from "vitest";
import { openAlertsCount } from "./open-alerts-count";

test("adds the open alerts of every level", () => {
  expect(
    openAlertsCount({
      critical: { openCount: 1, kinds: ["user_access_increased"] },
      warning: { openCount: 2, kinds: ["user_email_changed"] },
      informational: { openCount: 4, kinds: ["backoffice_recovery_requested"] },
    }),
  ).toBe(7);
});

test("counts none while no level has an open alert", () => {
  expect(
    openAlertsCount({
      critical: { openCount: 0, kinds: [] },
      warning: { openCount: 0, kinds: [] },
      informational: { openCount: 0, kinds: [] },
    }),
  ).toBe(0);
});
