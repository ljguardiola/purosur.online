import { describe, expect, it } from "vitest";
import {
  ALERT_KINDS,
  type AlertKind,
  alertKindDefinition,
  isAlertKind,
} from "./alert-kind-catalog.js";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

describe("ALERT_KINDS", () => {
  it("lists exactly the four security-fact kinds this issue delivers", () => {
    expect(ALERT_KINDS).toEqual([
      "backoffice_passkey_changed",
      "backoffice_recovery_requested",
      "user_email_changed",
      "backoffice_sign_in_lockout",
    ]);
  });
});

describe("alertKindDefinition", () => {
  it.each(ALERT_KINDS)("opens %s as a Warning, escalating after 24h, All audience", (kind) => {
    expect(alertKindDefinition(kind)).toEqual({
      kind,
      level: "warning",
      escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
      audience: "all",
    });
  });

  it("throws for a kind with no catalog entry", () => {
    expect(() => alertKindDefinition("not_a_real_kind" as AlertKind)).toThrow(/not_a_real_kind/);
  });
});

describe("isAlertKind", () => {
  it("accepts every catalog kind and rejects an unknown one", () => {
    for (const kind of ALERT_KINDS) {
      expect(isAlertKind(kind)).toBe(true);
    }
    expect(isAlertKind("not_a_real_kind")).toBe(false);
  });
});
