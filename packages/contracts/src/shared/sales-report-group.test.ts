import { describe, expect, it } from "vitest";
import { salesReportGroupSchema } from "./sales-report-group.js";

describe("salesReportGroupSchema", () => {
  it.each(["product", "category"])("accepts %s", (group) => {
    expect(salesReportGroupSchema.parse(group)).toBe(group);
  });

  it("refuses any other group", () => {
    expect(salesReportGroupSchema.safeParse("brand").success).toBe(false);
  });
});
