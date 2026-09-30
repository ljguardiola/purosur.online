import { describe, expect, it } from "vitest";
import { uuidV7Ids } from "./uuid-v7-ids";

describe("uuidV7Ids", () => {
  it("hands out version 7 UUIDs", () => {
    expect(uuidV7Ids.next()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("hands out ids that sort in the order they were handed out", () => {
    const ids = Array.from({ length: 50 }, () => uuidV7Ids.next());

    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(50);
  });
});
