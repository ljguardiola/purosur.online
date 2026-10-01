import { describe, expect, it } from "vitest";
import { ALERT_KINDS } from "./alert-catalog.js";
import { showsAlertScope } from "./alert-scope-visibility.js";

const CLOSED_AT = new Date("2026-10-01T12:00:00.000Z");

describe("showsAlertScope", () => {
  it("hides the scope of a closed alert scoped to a source address, since it then holds only a hash", () => {
    expect(showsAlertScope({ kind: "backoffice_sign_in_lockout", resolvedAt: CLOSED_AT })).toBe(
      false,
    );
  });

  it("shows the scope of an open alert scoped to a source address", () => {
    expect(showsAlertScope({ kind: "backoffice_sign_in_lockout", resolvedAt: null })).toBe(true);
  });

  it("shows the scope of every other kind, open or closed", () => {
    for (const kind of ALERT_KINDS.filter((kind) => kind !== "backoffice_sign_in_lockout")) {
      expect(showsAlertScope({ kind, resolvedAt: null })).toBe(true);
      expect(showsAlertScope({ kind, resolvedAt: CLOSED_AT })).toBe(true);
    }
  });
});
