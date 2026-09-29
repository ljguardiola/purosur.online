import { ALERT_KINDS, type AlertKind } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { alertKindDefinition } from "./alert-kind-catalog.js";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const WARNING_KINDS = ALERT_KINDS.filter((kind) => kind !== "user_access_increased");

const SCOPE_KIND_BY_ALERT_KIND: Record<AlertKind, "user" | "sourceAddress"> = {
  backoffice_passkey_changed: "user",
  backoffice_recovery_requested: "user",
  user_email_changed: "user",
  backoffice_sign_in_lockout: "sourceAddress",
  user_access_increased: "user",
};

describe("alertKindDefinition", () => {
  it.each(WARNING_KINDS)("opens %s as a Warning, escalating after 24h, All audience", (kind) => {
    expect(alertKindDefinition(kind)).toEqual({
      kind,
      level: "warning",
      escalatesAfterMs: TWENTY_FOUR_HOURS_MS,
      audience: "all",
      scopeKind: SCOPE_KIND_BY_ALERT_KIND[kind],
    });
  });

  it("opens an increase of someone's access as Critical from the start, All audience, scoped to that user", () => {
    expect(alertKindDefinition("user_access_increased")).toEqual({
      kind: "user_access_increased",
      level: "critical",
      escalatesAfterMs: null,
      audience: "all",
      scopeKind: "user",
    });
  });

  it("throws for a kind with no catalog entry", () => {
    expect(() => alertKindDefinition("not_a_real_kind" as AlertKind)).toThrow(/not_a_real_kind/);
  });
});
