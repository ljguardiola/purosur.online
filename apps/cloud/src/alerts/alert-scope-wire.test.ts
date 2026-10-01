import { describe, expect, it } from "vitest";
import { holdsOnlySourceAddressHash, scopeDisplay, wireScope } from "./alert-scope-wire.js";

const CLOSED_AT = new Date("2026-01-05T13:00:00.000Z");

describe("scopeDisplay", () => {
  it("resolves a user-scoped kind's scope through the given name map", () => {
    const names = new Map([["user-1", "Lucía Pérez"]]);

    expect(
      scopeDisplay({ kind: "user_email_changed", scope: "user-1", resolvedAt: null }, names),
    ).toBe("Lucía Pérez");
  });

  it("resolves a register-scoped kind's scope through the same name map", () => {
    const names = new Map([["register-1", "Caja 1"]]);

    expect(
      scopeDisplay({ kind: "register_enrolled", scope: "register-1", resolvedAt: null }, names),
    ).toBe("Caja 1");
  });

  it("falls back to the raw scope when the id isn't in the map", () => {
    expect(
      scopeDisplay(
        { kind: "user_email_changed", scope: "a-user-id", resolvedAt: null },
        new Map<string, string>(),
      ),
    ).toBe("a-user-id");
  });

  it("never looks the scope up for an open source-address-scoped kind: it's already displayable", () => {
    const names = new Map([["203.0.113.5", "shouldn't matter"]]);

    expect(
      scopeDisplay(
        { kind: "backoffice_sign_in_lockout", scope: "203.0.113.5", resolvedAt: null },
        names,
      ),
    ).toBe("203.0.113.5");
  });

  it("shows nothing for a closed source-address-scoped kind, whose scope no longer holds the address", () => {
    expect(
      scopeDisplay(
        { kind: "backoffice_sign_in_lockout", scope: "a-hashed-address", resolvedAt: CLOSED_AT },
        new Map<string, string>(),
      ),
    ).toBeNull();
  });

  it("falls back to the raw scope for a kind outside the catalog, instead of throwing", () => {
    const names = new Map([["scope_a", "shouldn't matter"]]);

    expect(scopeDisplay({ kind: "kind_a", scope: "scope_a", resolvedAt: null }, names)).toBe(
      "scope_a",
    );
  });
});

describe("wireScope", () => {
  it("sends the scope of an open alert", () => {
    expect(
      wireScope({ kind: "backoffice_sign_in_lockout", scope: "203.0.113.5", resolvedAt: null }),
    ).toBe("203.0.113.5");
  });

  it("withholds the hashed address of a closed source-address alert", () => {
    const closed = { kind: "backoffice_sign_in_lockout", scope: "a-hash", resolvedAt: CLOSED_AT };

    expect(holdsOnlySourceAddressHash(closed)).toBe(true);
    expect(wireScope(closed)).toBeNull();
  });

  it("sends the scope of a closed alert of any other kind, or of a kind outside the catalog", () => {
    expect(wireScope({ kind: "user_email_changed", scope: "user-1", resolvedAt: CLOSED_AT })).toBe(
      "user-1",
    );
    expect(wireScope({ kind: "kind_a", scope: "scope_a", resolvedAt: CLOSED_AT })).toBe("scope_a");
  });
});
