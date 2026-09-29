import type { BrandSummary } from "@purosur/contracts";
import { expect, test } from "vitest";
import { brandOptions } from "./product-brand-field";
import { NO_BRAND } from "./product-form";

const granix: BrandSummary = {
  id: "brand-1",
  name: "Granix",
  active: true,
  version: 1,
  productCount: 42,
};
const litoral: BrandSummary = {
  id: "brand-3",
  name: "Yerba del Litoral",
  active: false,
  version: 2,
  productCount: 3,
};

test("offers no brand first, then the active brands by name, none of them marked", () => {
  const dulcor: BrandSummary = { ...granix, id: "brand-9", name: "Dulcor" };

  expect(brandOptions([granix, litoral, dulcor], null)).toEqual([
    { value: NO_BRAND, label: "Sin marca" },
    { value: dulcor.id, label: "Dulcor" },
    { value: granix.id, label: "Granix" },
  ]);
});

test("offers the deactivated brand the product keeps, marked as inactive", () => {
  expect(brandOptions([granix, litoral], litoral.id)).toEqual([
    { value: NO_BRAND, label: "Sin marca" },
    { value: granix.id, label: "Granix" },
    { value: litoral.id, label: "Yerba del Litoral", status: "Inactiva" },
  ]);
});
