import { describe, expect, it } from "vitest";
import { alertListPageSchema, alertSummarySchema } from "./alert-summary.js";

const passkeyChange = {
  id: "alert-1",
  kind: "backoffice_passkey_changed",
  scope: "user-1",
  scopeDisplay: "Marcela",
  level: "warning",
  audience: "all",
  openedAt: "2026-05-04T13:10:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
};
const closedLockout = {
  ...passkeyChange,
  id: "alert-2",
  kind: "backoffice_sign_in_lockout",
  scope: null,
  scopeDisplay: null,
  level: "critical",
  audience: "local",
  escalatedAt: "2026-05-04T14:10:00.000Z",
  resolvedAt: "2026-05-04T15:10:00.000Z",
};
const page = {
  alerts: [passkeyChange, closedLockout],
  total: 30,
  pageSize: 25,
  openCount: 4,
  openCriticalCount: 1,
};

describe("alertSummarySchema", () => {
  it("accepts an open alert and a closed one without a scope", () => {
    expect(alertSummarySchema.safeParse(passkeyChange).data).toEqual(passkeyChange);
    expect(alertSummarySchema.safeParse(closedLockout).data).toEqual(closedLockout);
  });

  it("strips keys it does not define", () => {
    expect(alertSummarySchema.safeParse({ ...passkeyChange, detail: {} }).data).toEqual(
      passkeyChange,
    );
  });

  it("accepts a kind the catalog does not list, such as one a later release adds", () => {
    expect(alertSummarySchema.safeParse({ ...passkeyChange, kind: "kind_a" }).data).toEqual({
      ...passkeyChange,
      kind: "kind_a",
    });
  });

  it.each(["informational", "warning", "critical"])("accepts the level %s", (level) => {
    expect(alertSummarySchema.safeParse({ ...passkeyChange, level }).success).toBe(true);
  });

  it.each(["local", "all"])("accepts the audience %s", (audience) => {
    expect(alertSummarySchema.safeParse({ ...passkeyChange, audience }).success).toBe(true);
  });

  it.each(Object.keys(passkeyChange))("requires %s", (field) => {
    const { [field as keyof typeof passkeyChange]: _omitted, ...rest } = passkeyChange;

    expect(alertSummarySchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["id", null],
    ["kind", 1],
    ["kind", null],
    ["level", "info"],
    ["level", null],
    ["audience", "everyone"],
    ["audience", null],
    ["scope", 1],
    ["scope", undefined],
    ["scopeDisplay", 1],
    ["scopeDisplay", undefined],
    ["openedAt", 1],
    ["openedAt", null],
    ["escalatedAt", 1],
    ["escalatedAt", undefined],
    ["resolvedAt", 1],
    ["resolvedAt", undefined],
  ])("refuses %s as %j", (field, value) => {
    expect(alertSummarySchema.safeParse({ ...passkeyChange, [field]: value }).success).toBe(false);
  });
});

describe("alertListPageSchema", () => {
  it("accepts a page of alerts, empty or not", () => {
    expect(alertListPageSchema.safeParse(page).data).toEqual(page);
    expect(alertListPageSchema.safeParse({ ...page, alerts: [], total: 0 }).data).toEqual({
      ...page,
      alerts: [],
      total: 0,
    });
  });

  it("strips keys it does not define", () => {
    expect(alertListPageSchema.safeParse({ ...page, next: "2" }).data).toEqual(page);
  });

  it.each(Object.keys(page))("requires %s", (field) => {
    const { [field as keyof typeof page]: _omitted, ...rest } = page;

    expect(alertListPageSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["alerts", null],
    ["alerts", {}],
    ["alerts", [{ ...passkeyChange, level: "info" }]],
    ["total", "30"],
    ["total", 1.5],
    ["pageSize", "25"],
    ["pageSize", 25.5],
    ["pageSize", 0],
    ["openCount", "4"],
    ["openCount", 0.5],
    ["openCriticalCount", "1"],
    ["openCriticalCount", 0.5],
  ])("refuses %s as %j", (field, value) => {
    expect(alertListPageSchema.safeParse({ ...page, [field]: value }).success).toBe(false);
  });

  it.each([undefined, null, [], "alerts"])("refuses %j as a page", (body) => {
    expect(alertListPageSchema.safeParse(body).success).toBe(false);
  });
});
