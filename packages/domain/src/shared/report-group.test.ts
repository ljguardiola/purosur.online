import { describe, expect, it } from "vitest";
import { REPORT_GROUPS } from "./report-group.js";

describe("REPORT_GROUPS", () => {
  it("offers the product and the category", () => {
    expect(REPORT_GROUPS).toEqual(["product", "category"]);
  });
});
