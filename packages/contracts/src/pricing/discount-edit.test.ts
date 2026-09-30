import { describe, expect, it } from "vitest";
import { discountEditBodySchema } from "./discount-edit.js";

const ID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";

const valid = {
  name: "Verano",
  benefit: { kind: "PERCENT_OFF", percent: 15 },
  target: { kind: "PRODUCT", id: ID },
  validFrom: "2026-12-01",
  validTo: "2027-02-28",
  weekdays: [],
  version: 3,
  active: false,
};

function failures(body: unknown): { path: unknown[]; message: string }[] {
  const result = discountEditBodySchema.safeParse(body);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
}

describe("discountEditBodySchema", () => {
  it("accepts the creation body plus the loaded version and the active flag", () => {
    expect(discountEditBodySchema.safeParse(valid).data).toEqual(valid);
  });

  it.each([true, false])("accepts active %j", (active) => {
    expect(discountEditBodySchema.safeParse({ ...valid, active }).success).toBe(true);
  });

  it.each([undefined, null, "true", 1])("rejects active %j", (active) => {
    expect(failures({ ...valid, active })).toEqual([
      { path: ["active"], message: "active must be true or false" },
    ]);
  });

  it.each([undefined, 0, -1, 1.5, "3", null])("rejects the version %j", (version) => {
    expect(failures({ ...valid, version })).toEqual([
      { path: ["version"], message: "version must be the positive integer it was loaded with" },
    ]);
  });

  it("applies the creation rules, reporting them on the same body keys", () => {
    expect(failures({ ...valid, validFrom: "2027-03-01" })).toEqual([
      { path: ["validTo"], message: "validTo must not be before validFrom" },
    ]);
    expect(failures({ ...valid, validFrom: "0000-06-15" })).toEqual([
      { path: ["validFrom"], message: "validFrom must be a calendar day as YYYY-MM-DD" },
    ]);
    expect(failures({ ...valid, validTo: "0000-06-15" })).toEqual([
      { path: ["validTo"], message: "validTo must be a calendar day as YYYY-MM-DD" },
    ]);
    expect(failures({ ...valid, name: " " })).toEqual([
      { path: ["name"], message: "name must not be empty" },
    ]);
    expect(failures({ ...valid, benefit: { kind: "PERCENT_OFF", percent: 100 } })[0]?.path).toEqual(
      ["benefit", "percent"],
    );
  });

  it("strips keys it does not know", () => {
    expect(discountEditBodySchema.safeParse({ ...valid, id: "x" }).data).toEqual(valid);
  });
});
