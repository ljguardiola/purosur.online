import { describe, expect, it } from "vitest";
import {
  branchOfflinePointOfSaleListSchema,
  offlinePointOfSaleRetirementSchema,
} from "./offline-point-of-sale-retirement.js";

describe("branchOfflinePointOfSaleListSchema", () => {
  const retirable = {
    point_of_sale_number: 12,
    register_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
    register_name: "Caja 1",
    retirable: true,
    retired_at: null,
  };
  const retired = {
    ...retirable,
    point_of_sale_number: 13,
    retirable: false,
    retired_at: "2026-10-20T15:00:00.000Z",
  };

  it("reads the offline points of sale of a branch left without a register, retirable or retired", () => {
    const list = [retirable, retired];

    expect(branchOfflinePointOfSaleListSchema.parse(list)).toEqual(list);
    expect(branchOfflinePointOfSaleListSchema.parse([])).toEqual([]);
  });

  it.each(["point_of_sale_number", "register_id", "register_name", "retirable", "retired_at"])(
    "refuses one without its %s",
    (field) => {
      expect(
        branchOfflinePointOfSaleListSchema.safeParse([{ ...retirable, [field]: undefined }])
          .success,
      ).toBe(false);
    },
  );

  it("refuses a number the tax authority does not allow", () => {
    expect(
      branchOfflinePointOfSaleListSchema.safeParse([{ ...retirable, point_of_sale_number: 100000 }])
        .success,
    ).toBe(false);
  });

  it("refuses a retirement that is not an instant", () => {
    expect(
      branchOfflinePointOfSaleListSchema.safeParse([{ ...retired, retired_at: "yesterday" }])
        .success,
    ).toBe(false);
  });
});

describe("offlinePointOfSaleRetirementSchema", () => {
  const retirement = { point_of_sale_number: 12, retired_at: "2026-10-20T15:00:00.000Z" };

  it("reads the point of sale that was retired and when", () => {
    expect(offlinePointOfSaleRetirementSchema.parse(retirement)).toEqual(retirement);
  });

  it.each(["point_of_sale_number", "retired_at"])("refuses one without its %s", (field) => {
    expect(
      offlinePointOfSaleRetirementSchema.safeParse({ ...retirement, [field]: undefined }).success,
    ).toBe(false);
  });

  it("refuses a retirement that is not an instant", () => {
    expect(
      offlinePointOfSaleRetirementSchema.safeParse({ ...retirement, retired_at: null }).success,
    ).toBe(false);
  });
});
