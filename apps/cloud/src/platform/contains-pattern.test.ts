import { describe, expect, it } from "vitest";
import { containsPattern } from "./contains-pattern.js";

describe("containsPattern", () => {
  it("matches the text anywhere", () => {
    expect(containsPattern("yerba")).toBe("%yerba%");
  });

  it("matches the pattern's own characters literally", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
