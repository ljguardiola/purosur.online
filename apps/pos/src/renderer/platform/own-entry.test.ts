import { describe, expect, it } from "vitest";
import { ownEntry } from "./own-entry";

describe("ownEntry", () => {
  it("returns the entry stored under a key", () => {
    expect(ownEntry({ a: "first" }, "a")).toBe("first");
  });

  it("returns nothing for a key without an entry", () => {
    expect(ownEntry({ a: "first" }, "b")).toBeUndefined();
  });

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "returns nothing for %s, a member every object inherits",
    (key) => {
      expect(ownEntry({}, key)).toBeUndefined();
    },
  );

  it("returns the entry of a key named like an inherited member when it was stored", () => {
    const stored = JSON.parse('{"constructor": "mine", "__proto__": "own"}');

    expect(ownEntry(stored, "constructor")).toBe("mine");
    expect(ownEntry(stored, "__proto__")).toBe("own");
  });
});
