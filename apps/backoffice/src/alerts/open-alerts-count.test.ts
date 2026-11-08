import { expect, test } from "vitest";
import { openAlertsCount } from "./open-alerts-count";

test("adds the open alerts of every level", () => {
  expect(
    openAlertsCount({
      critical: { openCount: 1, kinds: ["user_access_increased"], localKinds: [] },
      warning: { openCount: 2, kinds: ["user_email_changed"], localKinds: [] },
      informational: { openCount: 4, kinds: ["backoffice_recovery_requested"], localKinds: [] },
    }),
  ).toBe(7);
});

test("counts none while no level has an open alert", () => {
  expect(
    openAlertsCount({
      critical: { openCount: 0, kinds: [], localKinds: [] },
      warning: { openCount: 0, kinds: [], localKinds: [] },
      informational: { openCount: 0, kinds: [], localKinds: [] },
    }),
  ).toBe(0);
});
