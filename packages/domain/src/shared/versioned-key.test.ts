import { describe, expect, it } from "vitest";
import { inVersionOrder, latestKey } from "./versioned-key.js";

describe("latestKey", () => {
  it("is the key with the highest version, whatever the order it comes in", () => {
    expect(
      latestKey([
        { version: 2, key: "second" },
        { version: 3, key: "third" },
        { version: 1, key: "first" },
      ]),
    ).toEqual({ version: 3, key: "third" });
  });

  it("is nothing when no key was generated yet", () => {
    expect(latestKey([])).toBeUndefined();
  });
});

describe("inVersionOrder", () => {
  it("lists the keys from the oldest version to the newest, leaving its input as it was", () => {
    const keys = [
      { version: 3, key: "third" },
      { version: 1, key: "first" },
      { version: 2, key: "second" },
    ];

    expect(inVersionOrder(keys)).toEqual([
      { version: 1, key: "first" },
      { version: 2, key: "second" },
      { version: 3, key: "third" },
    ]);
    expect(keys[0]).toEqual({ version: 3, key: "third" });
  });
});
