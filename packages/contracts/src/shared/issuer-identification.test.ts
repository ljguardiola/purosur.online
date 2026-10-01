import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type IssuerIdentificationBody,
  issuerIdentificationSchema,
} from "./issuer-identification.js";

const complete = {
  legal_name: FICTIONAL_LEGAL_NAME,
  gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
  activity_start_date: "2019-03-01",
  authorized_cuit: FICTIONAL_CUIT,
  tax_status: "Responsable Monotributo",
  version: 1,
};

const requiredFields = Object.keys(complete) as (keyof typeof complete)[];
const nullableFields = ["legal_name", "gross_income_registration", "activity_start_date"] as const;

describe("issuerIdentificationSchema", () => {
  it("accepts a complete identification", () => {
    expect(issuerIdentificationSchema.safeParse(complete).data).toEqual(complete);
  });

  it("accepts the incomplete identification that exists before the first save", () => {
    const incomplete = {
      ...complete,
      legal_name: null,
      gross_income_registration: null,
      activity_start_date: null,
    };

    expect(issuerIdentificationSchema.safeParse(incomplete).data).toEqual(incomplete);
  });

  it("strips keys it does not define", () => {
    expect(issuerIdentificationSchema.safeParse({ ...complete, environment: "test" }).data).toEqual(
      complete,
    );
  });

  it.each(requiredFields)("requires %s", (field) => {
    const { [field]: _omitted, ...rest } = complete;

    expect(issuerIdentificationSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["legal_name", 1],
    ["gross_income_registration", 1],
    ["activity_start_date", 20190301],
    ["authorized_cuit", 20000000001],
    ["authorized_cuit", null],
    ["tax_status", 1],
    ["tax_status", null],
    ["version", "1"],
    ["version", 1.5],
    ["version", null],
  ])("refuses %s as %j", (field, value) => {
    expect(issuerIdentificationSchema.safeParse({ ...complete, [field]: value }).success).toBe(
      false,
    );
  });

  it.each(nullableFields)("accepts %s as null but not as missing", (field) => {
    const { [field]: _omitted, ...rest } = complete;

    expect(issuerIdentificationSchema.safeParse({ ...complete, [field]: null }).success).toBe(true);
    expect(issuerIdentificationSchema.safeParse(rest).success).toBe(false);
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<IssuerIdentificationBody["legal_name"]>().toEqualTypeOf<string | null>();
    expectTypeOf<IssuerIdentificationBody["authorized_cuit"]>().toEqualTypeOf<string>();
    expectTypeOf<IssuerIdentificationBody["version"]>().toEqualTypeOf<number>();
  });
});
