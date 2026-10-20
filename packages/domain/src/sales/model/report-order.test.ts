import { describe, expect, it } from "vitest";
import { codeUnitOrder, nameOrder } from "./report-order.js";

describe("codeUnitOrder", () => {
  it("puts the text with the lower first code unit first", () => {
    expect(codeUnitOrder("a", "b")).toBe(-1);
    expect(codeUnitOrder("b", "a")).toBe(1);
  });

  it("finds two equal texts in the same place", () => {
    expect(codeUnitOrder("p1", "p1")).toBe(0);
  });

  it("puts capitals before lower case and accented letters after both", () => {
    expect(["ana", "Ábaco", "Zoe"].sort(codeUnitOrder)).toEqual(["Zoe", "ana", "Ábaco"]);
  });

  it("puts a text before a longer one it begins", () => {
    expect(codeUnitOrder("p1", "p10")).toBe(-1);
  });
});

describe("nameOrder", () => {
  it("orders two names by their code units", () => {
    expect(["Zoe", "ana", "Ana"].sort(nameOrder)).toEqual(["Ana", "Zoe", "ana"]);
  });

  it("puts a missing name after every name", () => {
    expect(nameOrder(null, "Zoe")).toBe(1);
    expect(nameOrder("Zoe", null)).toBe(-1);
  });

  it("finds two missing names in the same place", () => {
    expect(nameOrder(null, null)).toBe(0);
  });

  it("finds two equal names in the same place", () => {
    expect(nameOrder("Ana", "Ana")).toBe(0);
  });
});
