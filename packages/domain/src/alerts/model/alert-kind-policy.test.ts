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
    ["backoffice_passkey_changed", "warning", afterOpening, "all", "user", true],
    ["backoffice_recovery_requested", "warning", afterOpening, "all", "user", true],
    ["user_email_changed", "warning", afterOpening, "all", "user", true],
    ["backoffice_sign_in_lockout", "warning", afterOpening, "all", "sourceAddress", true],
    ["user_access_increased", "critical", null, "all", "user", false],
    ["register_enrolled", "warning", afterOpening, "all", "register", false],
    [
      "arca_certificate_expiring",
      "warning",
      { kind: "beforeDeadline", leadMs: ARCA_CERTIFICATE_EXPIRY_ESCALATION_MS },
      "all",
      "environment",
      true,
    ],
    ["events_quarantined", "warning", afterOpening, "all", "event", true],
    ["event_invariant_violated", "warning", afterOpening, "all", "event", true],
    ["update_required", "critical", null, "all", "register", true],
    ["register_silent", "critical", null, "local", "register", true],
  ] as const)(
    "%s opens as %s, escalates %o, is shown to %s, is scoped to %s and deduplicates: %s",
    (kind, level, escalation, audience, scopeKind, deduplicates) => {
      expect(alertKindPolicy(kind)).toMatchObject({
        level,
        escalation,
        audience,
        scopeKind,
        deduplicates,
      });
    },
  );

  it("resolves after its condition stays cleared only for the kinds that track an ongoing condition", () => {
    const stable = ALERT_KINDS.filter((kind) => alertKindPolicy(kind).resolvesAfterStableClear);

    expect(stable).toEqual(["update_required", "register_silent"]);
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
    expect(alertKindsWithScope("register")).toEqual([
      "register_enrolled",
      "update_required",
      "register_silent",
    ]);
    expect(alertKindsWithScope("event")).toEqual([
      "events_quarantined",
      "event_invariant_violated",
    ]);
    expect(alertKindsWithScope("environment")).toEqual(["arca_certificate_expiring"]);
  });
});
