import { describe, expect, it } from "vitest";
import { SALES_REPORT_GROUPS } from "./sales-report-group.js";

describe("SALES_REPORT_GROUPS", () => {
  it("offers the product and the category", () => {
    expect(SALES_REPORT_GROUPS).toEqual(["product", "category"]);
  });
});
