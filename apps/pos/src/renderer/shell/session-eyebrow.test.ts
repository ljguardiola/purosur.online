import { describe, expect, it } from "vitest";
import { sessionEyebrow } from "./session-eyebrow";

describe("sessionEyebrow", () => {
  it("names the register before saying that no session is open", () => {
    expect(sessionEyebrow("Caja 1", false)).toBe("Caja 1 · Sin sesión abierta");
  });

  it("only says that no session is open while the register's name isn't known", () => {
    expect(sessionEyebrow(null, false)).toBe("Sin sesión abierta");
  });

  it("names the register before saying that its session is open", () => {
    expect(sessionEyebrow("Caja 1", true)).toBe("Caja 1 · Sesión abierta");
  });

  it("only says that the session is open while the register's name isn't known", () => {
    expect(sessionEyebrow(null, true)).toBe("Sesión abierta");
  });
});
