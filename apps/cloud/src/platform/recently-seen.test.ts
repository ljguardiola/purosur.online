import { describe, expect, it } from "vitest";
import { RecentlySeen } from "./recently-seen.js";

describe("RecentlySeen", () => {
  it("tells a key is new only the first time it is seen", () => {
    const seen = new RecentlySeen(3);

    expect([seen.firstSighting("a"), seen.firstSighting("a"), seen.firstSighting("b")]).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("forgets the oldest key once it holds as many as it may, and only that one", () => {
    const seen = new RecentlySeen(2);
    seen.firstSighting("a");
    seen.firstSighting("b");
    seen.firstSighting("c");

    expect([seen.firstSighting("c"), seen.firstSighting("b"), seen.firstSighting("a")]).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("does not count a key seen again as a newer one", () => {
    const seen = new RecentlySeen(2);
    seen.firstSighting("a");
    seen.firstSighting("b");
    seen.firstSighting("a");
    seen.firstSighting("c");

    expect(seen.firstSighting("a")).toBe(true);
  });
});
