import { describe, expect, it } from "vitest";
import { packagingEditBodySchema } from "./packaging-edit.js";

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = packagingEditBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("packagingEditBodySchema", () => {
  it("reads the name, the quantity and the version loaded", () => {
    expect(
      packagingEditBodySchema.safeParse({ name: " Caja ", quantityPerPackage: 6_000, version: 2 })
        .data,
    ).toEqual({ name: "Caja", quantityPerPackage: 6_000, version: 2 });
  });

  it("applies the creation rules to the name and the quantity", () => {
    expect(firstFailure({ name: "", quantityPerPackage: 1_000, version: 1 })?.field).toBe("name");
    expect(firstFailure({ name: "A", quantityPerPackage: 0, version: 1 })?.field).toBe(
      "quantityPerPackage",
    );
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailure({ name: "A", quantityPerPackage: 1_000, version })).toEqual({
      field: "version",
      message: "version must be the positive integer it was loaded with",
    });
  });

  it("cannot move the packaging to another product or change whether it is active", () => {
    expect(
      packagingEditBodySchema.safeParse({
        name: "A",
        quantityPerPackage: 1_000,
        version: 1,
        productId: "11111111-1111-1111-1111-111111111111",
        active: false,
      }).data,
    ).toEqual({ name: "A", quantityPerPackage: 1_000, version: 1 });
  });
});
