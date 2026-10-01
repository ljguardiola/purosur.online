import { describe, expect, it } from "vitest";
import { pointOfSaleConfigurationBodySchema } from "./point-of-sale-configuration.js";

const FISCAL_ADDRESS_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    point_of_sale_number: 12,
    fiscal_address_id: FISCAL_ADDRESS_ID,
    version: 0,
    ...overrides,
  };
}

function firstFailure(body: unknown): { field: unknown; message: string | undefined } | undefined {
  const result = pointOfSaleConfigurationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("pointOfSaleConfigurationBodySchema", () => {
  it("reads the number, the fiscal address and the version loaded", () => {
    expect(pointOfSaleConfigurationBodySchema.safeParse(validBody()).data).toEqual(validBody());
  });

  it("accepts the lowest and the highest number the tax authority allows", () => {
    expect(firstFailure(validBody({ point_of_sale_number: 1 }))).toBeUndefined();
    expect(firstFailure(validBody({ point_of_sale_number: 99999 }))).toBeUndefined();
  });

  it.each([undefined, 0, -3, 100000, 1.5, "12", null, Number.NaN])(
    "rejects the number %j",
    (point_of_sale_number) => {
      expect(firstFailure(validBody({ point_of_sale_number }))).toEqual({
        field: "point_of_sale_number",
        message: "point_of_sale_number must be an integer from 1 to 99999",
      });
    },
  );

  it.each([undefined, "", "not-a-uuid", 7, null])("rejects the fiscal address %j", (value) => {
    expect(firstFailure(validBody({ fiscal_address_id: value }))).toEqual({
      field: "fiscal_address_id",
      message: "fiscal_address_id must be the id of a fiscal address",
    });
  });

  it("lowercases the fiscal address id so it compares like the stored one", () => {
    const result = pointOfSaleConfigurationBodySchema.safeParse(
      validBody({ fiscal_address_id: FISCAL_ADDRESS_ID.toUpperCase() }),
    );

    expect(result.data?.fiscal_address_id).toBe(FISCAL_ADDRESS_ID);
  });

  it("accepts the version 0 of a register never configured", () => {
    expect(firstFailure(validBody({ version: 0 }))).toBeUndefined();
  });

  it.each([undefined, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailure(validBody({ version }))).toEqual({
      field: "version",
      message: "version must be the non-negative integer it was loaded with",
    });
  });

  it("reports the number, then the fiscal address, then the version", () => {
    const fields = pointOfSaleConfigurationBodySchema
      .safeParse({})
      .error?.issues.map((issue) => issue.path[0]);

    expect(fields).toEqual(["point_of_sale_number", "fiscal_address_id", "version"]);
  });
});
