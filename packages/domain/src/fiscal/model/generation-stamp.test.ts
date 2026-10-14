import { describe, expect, it } from "vitest";
import { generationStampOf } from "./generation-stamp.js";

describe("generationStampOf", () => {
  it("writes the instant on Argentina's clock as yyyymmddhhmiss", () => {
    expect(generationStampOf(new Date("2026-03-05T14:07:09-03:00"))).toBe("20260305140709");
  });

  it("keeps Argentina's day when UTC has already moved to the next one", () => {
    expect(generationStampOf(new Date("2026-09-26T01:59:59.000Z"))).toBe("20260925225959");
  });

  it("reads midnight as 00 hours", () => {
    expect(generationStampOf(new Date("2026-09-26T00:00:00-03:00"))).toBe("20260926000000");
  });

  it("drops the fraction of a second", () => {
    expect(generationStampOf(new Date("2026-09-26T00:00:00.999-03:00"))).toBe("20260926000000");
  });
});
