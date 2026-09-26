import { ALERT_KINDS, type AlertKind } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { alertKindDefinition } from "./alert-kind-catalog.js";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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
