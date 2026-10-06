import { describe, expect, it } from "vitest";
import { ALERT_KINDS } from "./alert-catalog.js";
import {
  ALERT_ESCALATION_DELAY_MS,
  alertKindPolicy,
  alertKindsWithScope,
} from "./alert-kind-policy.js";

describe("alertKindPolicy", () => {
  it("escalates after 24 hours", () => {
    expect(ALERT_ESCALATION_DELAY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it.each([
    ["backoffice_passkey_changed", "warning", ALERT_ESCALATION_DELAY_MS, "user", true],
    ["backoffice_recovery_requested", "warning", ALERT_ESCALATION_DELAY_MS, "user", true],
    ["user_email_changed", "warning", ALERT_ESCALATION_DELAY_MS, "user", true],
    ["backoffice_sign_in_lockout", "warning", ALERT_ESCALATION_DELAY_MS, "sourceAddress", true],
    ["user_access_increased", "critical", null, "user", false],
    ["register_enrolled", "warning", ALERT_ESCALATION_DELAY_MS, "register", false],
  ] as const)(
    "%s opens as %s, escalates after %s, is scoped to %s and deduplicates: %s",
    (kind, level, escalatesAfterMs, scopeKind, deduplicates) => {
      expect(alertKindPolicy(kind)).toEqual({
        level,
        escalatesAfterMs,
        audience: "all",
        scopeKind,
        deduplicates,
      });
    },
  );

  it("answers for every alert kind", () => {
    for (const kind of ALERT_KINDS) {
      expect(alertKindPolicy(kind)).toBeDefined();
    }
  });
});

describe("alertKindsWithScope", () => {
  it("lists the kinds scoped to the given kind of scope, in catalog order", () => {
    expect(alertKindsWithScope("user")).toEqual([
      "backoffice_passkey_changed",
      "backoffice_recovery_requested",
      "user_email_changed",
      "user_access_increased",
    ]);
    expect(alertKindsWithScope("sourceAddress")).toEqual(["backoffice_sign_in_lockout"]);
    expect(alertKindsWithScope("register")).toEqual(["register_enrolled"]);
  });
});
