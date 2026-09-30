import { ALERT_KINDS, type AlertKind } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { type AlertScopeKind, alertKindDefinition } from "./alert-kind-catalog.js";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const WARNING_KINDS_OPENED_ONCE_WHILE_OPEN = ALERT_KINDS.filter(
  (kind) => kind !== "user_access_increased" && kind !== "register_enrolled",
);

const SCOPE_KIND_BY_ALERT_KIND: Record<AlertKind, AlertScopeKind> = {
  backoffice_passkey_changed: "user",
  backoffice_recovery_requested: "user",
  user_email_changed: "user",
  backoffice_sign_in_lockout: "sourceAddress",
  user_access_increased: "user",
  register_enrolled: "register",
};

describe("alertKindDefinition", () => {
  it.each(WARNING_KINDS_OPENED_ONCE_WHILE_OPEN)(
    "opens %s as a Warning, escalating after 24h, All audience, once while open",
    (kind) => {
      expect(alertKindDefinition(kind)).toEqual({
        kind,
        level: "warning",
        escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
        audience: "all",
        scopeKind: SCOPE_KIND_BY_ALERT_KIND[kind],
        deduplicates: true,
      });
    },
  );

  it("opens every increase of someone's access as its own Critical, All-audience alert scoped to that user", () => {
    expect(alertKindDefinition("user_access_increased")).toEqual({
      kind: "user_access_increased",
      level: "critical",
      escalatesAfterMs: null,
      audience: "all",
      scopeKind: "user",
      deduplicates: false,
    });
  });

  it("opens every enrollment of a register as its own Warning, escalating after 24h, All audience, scoped to that register", () => {
    expect(alertKindDefinition("register_enrolled")).toEqual({
      kind: "register_enrolled",
      level: "warning",
      escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
      audience: "all",
      scopeKind: "register",
      deduplicates: false,
    });
  });

  it("throws for a kind with no catalog entry", () => {
    expect(() => alertKindDefinition("not_a_real_kind" as AlertKind)).toThrow(/not_a_real_kind/);
  });
});
