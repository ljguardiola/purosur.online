import type { AlertKind } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { openAlertsOverviewOf } from "./open-alerts-overview.js";

const KIND: AlertKind = "user_email_changed";

describe("openAlertsOverviewOf", () => {
  it("adds each level's counts and kinds in the order the rows come, and which of them are of Local audience", () => {
    const overview = openAlertsOverviewOf([
      { level: "critical", kind: KIND, audience: "all", openCount: 2 },
      { level: "critical", kind: "sales_denied", audience: "local", openCount: 1 },
      { level: "warning", kind: KIND, audience: "all", openCount: 4 },
    ]);

    expect(overview).toEqual({
      critical: { openCount: 3, kinds: [KIND, "sales_denied"], localKinds: ["sales_denied"] },
      warning: { openCount: 4, kinds: [KIND], localKinds: [] },
      informational: { openCount: 0, kinds: [], localKinds: [] },
    });
  });

  it("leaves out a level named like an inherited member as any other unknown level", () => {
    const rows = (level: string) => [
      { level: "critical", kind: KIND, audience: "all" as const, openCount: 1 },
      { level, kind: KIND, audience: "all" as const, openCount: 5 },
    ];

    const expected = {
      critical: { openCount: 1, kinds: [KIND], localKinds: [] },
      warning: { openCount: 0, kinds: [], localKinds: [] },
      informational: { openCount: 0, kinds: [], localKinds: [] },
    };
    expect(openAlertsOverviewOf(rows("unlisted"))).toEqual(expected);
    expect(openAlertsOverviewOf(rows("constructor"))).toEqual(expected);
  });

  it("lists a kind once when its open alerts are of both audiences", () => {
    const overview = openAlertsOverviewOf([
      { level: "warning", kind: KIND, audience: "all", openCount: 1 },
      { level: "warning", kind: KIND, audience: "local", openCount: 2 },
    ]);

    expect(overview.warning).toEqual({ openCount: 3, kinds: [KIND], localKinds: [KIND] });
  });
});
