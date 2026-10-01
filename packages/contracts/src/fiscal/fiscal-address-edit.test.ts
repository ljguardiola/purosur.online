import { describe, expect, it } from "vitest";
import { fiscalAddressEditBodySchema } from "./fiscal-address-edit.js";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Depósito Central",
    street_address: "Calle Ficticia 123, CABA",
    version: 2,
    ...overrides,
  };
}

function firstFailure(body: unknown): { field: unknown; message: string | undefined } | undefined {
  const result = fiscalAddressEditBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("fiscalAddressEditBodySchema", () => {
  it("reads the name, the street address and the version loaded", () => {
    expect(fiscalAddressEditBodySchema.safeParse(validBody()).data).toEqual(validBody());
  });

  it("applies the creation rules to the name and the street address", () => {
    expect(firstFailure(validBody({ name: "  " }))?.field).toBe("name");
    expect(firstFailure(validBody({ street_address: "  " }))?.field).toBe("street_address");
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailure(validBody({ version }))).toEqual({
      field: "version",
      message: "version must be the positive integer it was loaded with",
    });
  });
});
