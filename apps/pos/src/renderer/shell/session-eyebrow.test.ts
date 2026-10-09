import { describe, expect, it } from "vitest";
import { sessionEyebrow } from "./session-eyebrow";

describe("sessionEyebrow", () => {
  it("names the register before saying that no session is open", () => {
    expect(sessionEyebrow("Caja 1")).toBe("Caja 1 · Sin sesión abierta");
  });

  it("only says that no session is open while the register's name isn't known", () => {
    expect(sessionEyebrow(null)).toBe("Sin sesión abierta");
  });
});
