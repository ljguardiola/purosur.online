import { SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { supplierPriceListPageRefusedSchema } from "./supplier-price-list-page-refused.js";

const MESSAGE = "the page could not be read";

describe("supplierPriceListPageRefusedSchema", () => {
  it.each(SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS)("reads a page refused for %s", (reason) => {
    expect(
      supplierPriceListPageRefusedSchema.parse({ code: "page_refused", message: MESSAGE, reason }),
    ).toEqual({ code: "page_refused", message: MESSAGE, reason });
  });

  it.each([
    { code: "page_refused", message: MESSAGE, reason: "blocked" },
    { code: "page_refused", message: MESSAGE },
    { code: "daily_cap_reached", message: MESSAGE, reason: "too_large" },
    { code: "page_refused", reason: "too_large" },
  ])("refuses the body %j", (body) => {
    expect(supplierPriceListPageRefusedSchema.safeParse(body).success).toBe(false);
  });
});
