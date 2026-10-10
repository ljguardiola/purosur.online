import { describe, expect, it } from "vitest";
import { offlinePointOfSaleConfigurationBodySchema } from "./offline-point-of-sale-configuration.js";

function firstFailure(body: unknown): { field: unknown; message: string | undefined } | undefined {
  const result = offlinePointOfSaleConfigurationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("offlinePointOfSaleConfigurationBodySchema", () => {
  it("reads the number and the version loaded", () => {
    const body = { point_of_sale_number: 12, version: 0 };

    expect(offlinePointOfSaleConfigurationBodySchema.safeParse(body).data).toEqual(body);
  });

  it("keeps no fiscal address, since the offline point of sale uses the real-time one's", () => {
    const result = offlinePointOfSaleConfigurationBodySchema.safeParse({
      point_of_sale_number: 12,
      fiscal_address_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      version: 1,
    });

    expect(result.data).toEqual({ point_of_sale_number: 12, version: 1 });
  });

  it("accepts the lowest and the highest number the tax authority allows", () => {
    expect(firstFailure({ point_of_sale_number: 1, version: 0 })).toBeUndefined();
    expect(firstFailure({ point_of_sale_number: 99999, version: 0 })).toBeUndefined();
  });

  it.each([undefined, 0, -3, 100000, 1.5, "12", null, Number.NaN])(
    "rejects the number %j",
    (point_of_sale_number) => {
      expect(firstFailure({ point_of_sale_number, version: 0 })).toEqual({
        field: "point_of_sale_number",
        message: "point_of_sale_number must be an integer from 1 to 99999",
      });
    },
  );

  it.each([undefined, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailure({ point_of_sale_number: 12, version })).toEqual({
      field: "version",
      message: "version must be the non-negative integer it was loaded with",
    });
  });

  it("reports the number, then the version", () => {
    const fields = offlinePointOfSaleConfigurationBodySchema
      .safeParse({})
      .error?.issues.map((issue) => issue.path[0]);

    expect(fields).toEqual(["point_of_sale_number", "version"]);
  });
});
