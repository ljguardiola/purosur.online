import type { BrandSummary } from "@purosur/contracts";
import { expect, test } from "vitest";
import { brandOptions } from "./product-brand-field";
import { NO_BRAND } from "./product-form";

const granvel: BrandSummary = {
  id: "brand-1",
  name: "Granvel",
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
  const dulcor: BrandSummary = { ...granvel, id: "brand-9", name: "Dulcor" };

  expect(brandOptions([granvel, litoral, dulcor], null)).toEqual([
    { value: NO_BRAND, label: "Sin marca" },
    { value: dulcor.id, label: "Dulcor" },
    { value: granvel.id, label: "Granvel" },
  ]);
});

test("offers the deactivated brand the product keeps, marked as inactive", () => {
  expect(brandOptions([granvel, litoral], litoral.id)).toEqual([
    { value: NO_BRAND, label: "Sin marca" },
    { value: granvel.id, label: "Granvel" },
    { value: litoral.id, label: "Yerba del Litoral", status: "Inactiva" },
  ]);
});
