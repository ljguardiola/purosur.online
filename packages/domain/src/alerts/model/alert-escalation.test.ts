import { describe, expect, it } from "vitest";
import { ESCALATED_LEVEL, escalatesAt, isDueForEscalation } from "./alert-escalation.js";
import { ALERT_ESCALATION_DELAY_MS } from "./alert-kind-policy.js";

const OPENED = new Date("2026-10-01T08:00:00.000Z");
const DUE = new Date(OPENED.getTime() + ALERT_ESCALATION_DELAY_MS);

describe("escalatesAt", () => {
  it("is the escalation delay after the alert opened, for a kind that escalates", () => {
    expect(escalatesAt("backoffice_passkey_changed", OPENED)).toEqual(DUE);
  });

  it("is never, for a kind that opens already critical", () => {
    expect(escalatesAt("user_access_increased", OPENED)).toBeNull();
  });
});

describe("isDueForEscalation", () => {
  const warning = { level: "warning", resolvedAt: null, escalateAt: DUE } as const;
  const justBefore = new Date(DUE.getTime() - 1);
  const justAfter = new Date(DUE.getTime() + 1);

  it("is due from the escalation moment on", () => {
    expect(isDueForEscalation(warning, justBefore)).toBe(false);
    expect(isDueForEscalation(warning, DUE)).toBe(true);
    expect(isDueForEscalation(warning, justAfter)).toBe(true);
  });

  it("is never due once closed", () => {
    expect(isDueForEscalation({ ...warning, resolvedAt: OPENED }, justAfter)).toBe(false);
  });

  it("is only due while still a warning", () => {
    expect(isDueForEscalation({ ...warning, level: "critical" }, justAfter)).toBe(false);
    expect(isDueForEscalation({ ...warning, level: "informational" }, justAfter)).toBe(false);
  });

  it("is never due without an escalation moment", () => {
    expect(isDueForEscalation({ ...warning, escalateAt: null }, justAfter)).toBe(false);
  });
});

describe("ESCALATED_LEVEL", () => {
  it("is critical", () => {
    expect(ESCALATED_LEVEL).toBe("critical");
  });
});
