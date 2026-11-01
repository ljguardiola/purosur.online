import { MAX_STOCK_QUANTITY } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { packageCountFields } from "./package-count-fields.js";

const schema = z.object(packageCountFields);

function firstFailure(body: unknown): { path: unknown[]; message: string } | undefined {
  const result = schema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

describe("packageCountFields", () => {
  it("accepts a number of packages and the quantity each holds", () => {
    expect(schema.safeParse({ packages: 2, quantityPerPackage: 12_000 }).data).toEqual({
      packages: 2,
      quantityPerPackage: 12_000,
    });
  });

  it.each([undefined, 0, -1, 1.5, "2", MAX_STOCK_QUANTITY + 1])(
    "rejects %j as a number of packages",
    (packages) => {
      expect(firstFailure({ packages, quantityPerPackage: 12_000 })).toEqual({
        path: ["packages"],
        message: "packages must be a positive whole number",
      });
    },
  );

  it.each([undefined, 0, -1_000, 0.5, "12000"])(
    "rejects %j as the quantity each package holds",
    (quantityPerPackage) => {
      expect(firstFailure({ packages: 2, quantityPerPackage })).toEqual({
        path: ["quantityPerPackage"],
        message: "quantityPerPackage must be a positive integer number of thousandths",
      });
    },
  );
});
