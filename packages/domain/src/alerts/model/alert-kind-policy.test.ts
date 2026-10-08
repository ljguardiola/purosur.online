import { describe, expect, it } from "vitest";
import { ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS } from "../../fiscal/index.js";
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

  const afterOpening = { kind: "afterOpening", delayMs: ALERT_ESCALATION_DELAY_MS } as const;

  it.each([
    ["backoffice_passkey_changed", "warning", afterOpening, "user", true],
    ["backoffice_recovery_requested", "warning", afterOpening, "user", true],
    ["user_email_changed", "warning", afterOpening, "user", true],
    ["backoffice_sign_in_lockout", "warning", afterOpening, "sourceAddress", true],
    ["user_access_increased", "critical", null, "user", false],
    ["register_enrolled", "warning", afterOpening, "register", false],
    [
      "arca_certificate_expiring",
      "warning",
      { kind: "beforeDeadline", leadMs: ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS },
      "environment",
      true,
    ],
    ["events_quarantined", "warning", afterOpening, "event", true],
    ["event_invariant_violated", "warning", afterOpening, "event", true],
    ["update_required", "critical", null, "register", true],
  ] as const)(
    "%s opens as %s, escalates %o, is scoped to %s and deduplicates: %s",
    (kind, level, escalation, scopeKind, deduplicates) => {
      expect(alertKindPolicy(kind)).toMatchObject({
        level,
        escalation,
        audience: "all",
        scopeKind,
        deduplicates,
      });
    },
  );

  it("resolves after its condition stays cleared only for the kind that tracks an ongoing condition", () => {
    const stable = ALERT_KINDS.filter((kind) => alertKindPolicy(kind).resolvesAfterStableClear);

    expect(stable).toEqual(["update_required"]);
  });

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
    expect(alertKindsWithScope("register")).toEqual(["register_enrolled", "update_required"]);
    expect(alertKindsWithScope("event")).toEqual([
      "events_quarantined",
      "event_invariant_violated",
    ]);
    expect(alertKindsWithScope("environment")).toEqual(["arca_certificate_expiring"]);
  });
});
