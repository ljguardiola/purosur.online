import {
  isAlertKind as isSharedAlertKind,
  ALERT_KINDS as SHARED_ALERT_KINDS,
} from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  ALERT_KINDS,
  type AlertKind,
  alertKindDefinition,
  isAlertKind,
} from "./alert-kind-catalog.js";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

describe("the cloud's local alert kind list", () => {
  it("matches the shared catalog's kinds, in the same order", () => {
    expect(ALERT_KINDS).toEqual(SHARED_ALERT_KINDS);
  });

  it("accepts every shared catalog kind and rejects an unknown one, the same as the shared guard", () => {
    for (const kind of SHARED_ALERT_KINDS) {
      expect(isAlertKind(kind)).toBe(isSharedAlertKind(kind));
      expect(isAlertKind(kind)).toBe(true);
    }
    expect(isAlertKind("not_a_real_kind")).toBe(false);
  });
});

const SCOPE_KIND_BY_ALERT_KIND: Record<AlertKind, "user" | "sourceAddress"> = {
  backoffice_passkey_changed: "user",
  backoffice_recovery_requested: "user",
  user_email_changed: "user",
  backoffice_sign_in_lockout: "sourceAddress",
};

describe("alertKindDefinition", () => {
  it.each(ALERT_KINDS)("opens %s as a Warning, escalating after 24h, All audience", (kind) => {
    expect(alertKindDefinition(kind)).toEqual({
      kind,
      level: "warning",
      escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
      audience: "all",
      scopeKind: SCOPE_KIND_BY_ALERT_KIND[kind],
    });
  });

  it("throws for a kind with no catalog entry", () => {
    expect(() => alertKindDefinition("not_a_real_kind" as AlertKind)).toThrow(/not_a_real_kind/);
  });
});
