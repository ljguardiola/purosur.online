import { describe, expect, it } from "vitest";
import { registerOfflinePointOfSaleSchema } from "./register-offline-point-of-sale.js";

const configured = {
  register_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  point_of_sale_number: 12,
  version: 1,
};

describe("registerOfflinePointOfSaleSchema", () => {
  it("reads the offline point of sale a register was configured with", () => {
    expect(registerOfflinePointOfSaleSchema.parse(configured)).toEqual(configured);
  });

  it.each(["register_id", "point_of_sale_number", "version"])(
    "refuses one without its %s",
    (field) => {
      expect(
        registerOfflinePointOfSaleSchema.safeParse({ ...configured, [field]: undefined }).success,
      ).toBe(false);
    },
  );

  it("refuses a number the tax authority does not allow", () => {
    expect(
      registerOfflinePointOfSaleSchema.safeParse({ ...configured, point_of_sale_number: 100000 })
        .success,
    ).toBe(false);
  });
});
