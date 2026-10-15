import { describe, expect, it } from "vitest";
import { offsiteDumpNightSchema } from "./offsite-dump-night.js";

describe("offsiteDumpNightSchema", () => {
  it("accepts a calendar day written YYYY-MM-DD", () => {
    expect(offsiteDumpNightSchema.parse("2026-10-14")).toBe("2026-10-14");
  });

  it.each(["14/10/2026", "2026-02-30", "2026-10-14T00:00:00Z"])("refuses %s", (night) => {
    expect(offsiteDumpNightSchema.safeParse(night).success).toBe(false);
  });

  it("tells a refused night to be written as a calendar day YYYY-MM-DD", () => {
    const result = offsiteDumpNightSchema.safeParse("14/10/2026");

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "night must be a calendar day written YYYY-MM-DD",
    ]);
  });
});
