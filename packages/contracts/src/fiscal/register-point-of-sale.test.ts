import { describe, expect, it } from "vitest";
import {
  registerPointOfSaleOverviewListSchema,
  registerPointOfSaleSchema,
} from "./register-point-of-sale.js";

const configured = {
  register_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  point_of_sale_number: 12,
  fiscal_address_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  version: 1,
};

describe("registerPointOfSaleSchema", () => {
  it("reads the point of sale a register was configured with", () => {
    expect(registerPointOfSaleSchema.parse(configured)).toEqual(configured);
  });

  it.each(["register_id", "point_of_sale_number", "fiscal_address_id", "version"])(
    "refuses one without its %s",
    (field) => {
      expect(
        registerPointOfSaleSchema.safeParse({ ...configured, [field]: undefined }).success,
      ).toBe(false);
    },
  );

  it("refuses a number the tax authority does not allow", () => {
    expect(
      registerPointOfSaleSchema.safeParse({ ...configured, point_of_sale_number: 100000 }).success,
    ).toBe(false);
  });
});

describe("registerPointOfSaleOverviewListSchema", () => {
  const overview = {
    register_id: configured.register_id,
    register_name: "Caja 1",
    point_of_sale_number: 12,
    fiscal_address_id: configured.fiscal_address_id,
    version: 1,
  };
  const neverConfigured = {
    ...overview,
    point_of_sale_number: null,
    fiscal_address_id: null,
    version: 0,
  };

  it("reads the registers of a branch, configured or not", () => {
    const list = [overview, neverConfigured];

    expect(registerPointOfSaleOverviewListSchema.parse(list)).toEqual(list);
    expect(registerPointOfSaleOverviewListSchema.parse([])).toEqual([]);
  });

  it.each(["register_id", "register_name", "point_of_sale_number", "fiscal_address_id", "version"])(
    "refuses a register without its %s",
    (field) => {
      expect(
        registerPointOfSaleOverviewListSchema.safeParse([{ ...overview, [field]: undefined }])
          .success,
      ).toBe(false);
    },
  );

  it("refuses a number the tax authority does not allow", () => {
    expect(
      registerPointOfSaleOverviewListSchema.safeParse([{ ...overview, point_of_sale_number: 0 }])
        .success,
    ).toBe(false);
  });
});
