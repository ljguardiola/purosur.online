import { describe, expect, it } from "vitest";
import { sessionEyebrow } from "./session-eyebrow";

describe("sessionEyebrow", () => {
  it("names the register before saying that no session is open", () => {
    expect(sessionEyebrow("Caja 1")).toBe("Caja 1 · Sin sesión abierta");
  });

  it("only says that no session is open while the register's name isn't known", () => {
    expect(sessionEyebrow(null)).toBe("Sin sesión abierta");
  });

  const OPENED_AT = "2026-09-30T09:02:00.000-03:00";

  it("names the register and the Argentine time the session opened at", () => {
    expect(sessionEyebrow("Caja 1", OPENED_AT)).toBe("Caja 1 · Sesión abierta 09:02");
  });

  it("says when the session opened without the register's name while it isn't known", () => {
    expect(sessionEyebrow(null, OPENED_AT)).toBe("Sesión abierta 09:02");
  });

  it("writes the time on a 24-hour clock", () => {
    expect(sessionEyebrow(null, "2026-09-30T20:45:00.000-03:00")).toBe("Sesión abierta 20:45");
  });
});
