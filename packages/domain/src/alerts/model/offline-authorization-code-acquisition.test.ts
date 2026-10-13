import { describe, expect, it } from "vitest";
import type { Fortnight } from "../../fiscal/index.js";
import {
  acquisitionUrgencyAlertLevel,
  offlineAuthorizationCodeAcquisitionLevel,
} from "./offline-authorization-code-acquisition.js";

const SECOND_HALF_OF_OCTOBER: Fortnight = { start: "2026-10-16", end: "2026-10-31" };

describe("acquisitionUrgencyAlertLevel", () => {
  it.each([
    ["early", "informational"],
    ["due", "warning"],
    ["pressing", "critical"],
  ] as const)("raises an alert of %s urgency as %s", (urgency, level) => {
    expect(acquisitionUrgencyAlertLevel(urgency)).toBe(level);
  });
});

describe("offlineAuthorizationCodeAcquisitionLevel", () => {
  it("raises no alert on a day outside the fortnight's request window", () => {
    expect(offlineAuthorizationCodeAcquisitionLevel(SECOND_HALF_OF_OCTOBER, "2026-10-10")).toBe(
      null,
    );
  });

  it("raises the alert at the level of the day's urgency inside the window", () => {
    expect(offlineAuthorizationCodeAcquisitionLevel(SECOND_HALF_OF_OCTOBER, "2026-10-13")).toBe(
      "warning",
    );
  });
});
