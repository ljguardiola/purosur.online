import { describe, expect, it } from "vitest";
import { ALERT_KINDS } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";
import { alertActorId, alertNamedRecordIds, alertScopeNamesRecord } from "./alert-named-records.js";

const SCOPE = "3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6";
const ACTOR_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const kindsScopedTo = (scopeKind: "user" | "register" | "sourceAddress" | "event") =>
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

  it("does not name the scope of an alert scoped to an event", () => {
    for (const kind of kindsScopedTo("event")) {
      expect(alertNamedRecordIds({ kind, scope: SCOPE })).toEqual([]);
    }
  });

  it("does not name the scope of an alert of a kind outside the catalog, whose scope is unknown", () => {
    expect(alertNamedRecordIds({ kind: "retired_kind", scope: SCOPE })).toEqual([]);
  });

  it("names the actor of an alert of a kind outside the catalog", () => {
    expect(
      alertNamedRecordIds({ kind: "retired_kind", scope: SCOPE, detail: { actorId: ACTOR_ID } }),
    ).toEqual([ACTOR_ID]);
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

describe("alertScopeNamesRecord", () => {
  it("answers that the scope of a user or register kind names a record", () => {
    for (const kind of [...kindsScopedTo("user"), ...kindsScopedTo("register")]) {
      expect(alertScopeNamesRecord(kind)).toBe(true);
    }
  });

  it("answers that the scope of a source-address kind names no record", () => {
    for (const kind of kindsScopedTo("sourceAddress")) {
      expect(alertScopeNamesRecord(kind)).toBe(false);
    }
  });

  it("answers that the scope of a kind outside the catalog names no record", () => {
    expect(alertScopeNamesRecord("retired_kind")).toBe(false);
  });
});

describe("alertActorId", () => {
  it("reads the actor id of a detail", () => {
    expect(alertActorId({ actorId: ACTOR_ID })).toBe(ACTOR_ID);
  });

  it.each([
    ["a number", { actorId: 7 }],
    ["null", { actorId: null }],
    ["missing", {}],
    ["in no detail at all", undefined],
  ])("reads no actor id when it is %s", (_label, detail) => {
    expect(alertActorId(detail)).toBeUndefined();
  });
});
