import { describe, expect, it } from "vitest";
import { reportGroupSchema } from "./report-group.js";

describe("reportGroupSchema", () => {
  it.each(["product", "category"])("accepts %s", (group) => {
    expect(reportGroupSchema.parse(group)).toBe(group);
  });

  it("refuses any other group", () => {
    expect(reportGroupSchema.safeParse("brand").success).toBe(false);
  });
});
