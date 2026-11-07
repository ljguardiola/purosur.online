import type { AlertKind } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { openAlertsOverviewOf } from "./open-alerts-overview.js";

const KIND: AlertKind = "user_email_changed";

describe("openAlertsOverviewOf", () => {
  it("adds each level's counts and kinds in the order the rows come", () => {
    const overview = openAlertsOverviewOf([
      { level: "critical", kind: KIND, openCount: 2 },
      { level: "critical", kind: "sales_denied", openCount: 1 },
      { level: "warning", kind: KIND, openCount: 4 },
    ]);

    expect(overview).toEqual({
      critical: { openCount: 3, kinds: [KIND, "sales_denied"] },
      warning: { openCount: 4, kinds: [KIND] },
      informational: { openCount: 0, kinds: [] },
    });
  });

  it("leaves out a level named like an inherited member as any other unknown level", () => {
    const rows = (level: string) => [
      { level: "critical", kind: KIND, openCount: 1 },
      { level, kind: KIND, openCount: 5 },
    ];

    const expected = {
      critical: { openCount: 1, kinds: [KIND] },
      warning: { openCount: 0, kinds: [] },
      informational: { openCount: 0, kinds: [] },
    };
    expect(openAlertsOverviewOf(rows("unlisted"))).toEqual(expected);
    expect(openAlertsOverviewOf(rows("constructor"))).toEqual(expected);
  });
});
