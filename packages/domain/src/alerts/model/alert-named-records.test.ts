import { describe, expect, it } from "vitest";
import { ALERT_KINDS } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";
import { alertNamedRecordIds } from "./alert-named-records.js";

const SCOPE = "3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6";
const ACTOR_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const kindsScopedTo = (scopeKind: "user" | "register" | "sourceAddress") =>
  ALERT_KINDS.filter((kind) => alertKindPolicy(kind).scopeKind === scopeKind);

describe("alertNamedRecordIds", () => {
  it("names the scope of an alert scoped to a user or a register", () => {
    for (const kind of [...kindsScopedTo("user"), ...kindsScopedTo("register")]) {
      expect(alertNamedRecordIds({ kind, scope: SCOPE })).toEqual([SCOPE]);
    }
  });

  it("does not name the scope of an alert scoped to a source address, which is no record id", () => {
    for (const kind of kindsScopedTo("sourceAddress")) {
      expect(alertNamedRecordIds({ kind, scope: "203.0.113.7" })).toEqual([]);
    }
  });

  it("names the actor of the detail after the scope", () => {
    expect(
      alertNamedRecordIds({
        kind: "user_email_changed",
        scope: SCOPE,
        detail: { actorId: ACTOR_ID },
      }),
    ).toEqual([SCOPE, ACTOR_ID]);
  });

  it("names the actor of an alert scoped to a source address on its own", () => {
    expect(
      alertNamedRecordIds({
        kind: "backoffice_sign_in_lockout",
        scope: "203.0.113.7",
        detail: { actorId: ACTOR_ID },
      }),
    ).toEqual([ACTOR_ID]);
  });

  it.each([
    ["a number", 7],
    ["null", null],
    ["missing", undefined],
  ])("does not name an actor that is %s", (_label, actorId) => {
    expect(
      alertNamedRecordIds({ kind: "user_email_changed", scope: SCOPE, detail: { actorId } }),
    ).toEqual([SCOPE]);
  });
});
