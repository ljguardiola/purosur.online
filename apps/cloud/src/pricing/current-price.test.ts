import { describe, expect, it } from "vitest";
import { momentAfter } from "./current-price.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

describe("momentAfter", () => {
  it("keeps now when every committed moment is earlier", () => {
    const earlier = new Date(NOON.getTime() - 5_000);

    expect(momentAfter(NOON, [earlier, undefined])).toEqual(NOON);
  });

  it("moves past a committed moment equal to now", () => {
    expect(momentAfter(NOON, [new Date(NOON)])).toEqual(new Date(NOON.getTime() + 1));
  });

  it("moves past the latest committed moment when several are at or after now", () => {
    const later = new Date(NOON.getTime() + 5_000);

    expect(momentAfter(NOON, [later, new Date(NOON)])).toEqual(new Date(later.getTime() + 1));
  });
});
