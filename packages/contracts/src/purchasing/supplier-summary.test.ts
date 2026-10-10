import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { supplierListSchema, supplierSummarySchema } from "./supplier-summary.js";

const norte = {
  id: "s-1",
  name: "Norte",
  cuit: FICTIONAL_CUIT,
  contact: "ventas@example.com",
  note: "Entrega los martes",
  active: true,
  version: 1,
};
const sur = {
  id: "s-2",
  name: "Sur",
  cuit: null,
  contact: null,
  note: null,
  active: false,
  version: 3,
};

describe("supplierSummarySchema", () => {
  it("accepts a supplier with every field and one with none of the optional ones", () => {
    expect(supplierSummarySchema.safeParse(norte).data).toEqual(norte);
    expect(supplierSummarySchema.safeParse(sur).data).toEqual(sur);
  });

  it("strips keys it does not define", () => {
    expect(supplierSummarySchema.safeParse({ ...norte, createdAt: "today" }).data).toEqual(norte);
  });

  it.each(["id", "name", "cuit", "contact", "note", "active", "version"])(
    "requires %s",
    (field) => {
      const { [field as keyof typeof norte]: _omitted, ...rest } = norte;

      expect(supplierSummarySchema.safeParse(rest).success).toBe(false);
    },
  );

  it.each([
    ["id", 1],
    ["name", null],
    ["cuit", 20],
    ["contact", 1],
    ["note", false],
    ["active", "true"],
    ["version", 1.5],
  ])("refuses %s as %j", (field, value) => {
    expect(supplierSummarySchema.safeParse({ ...norte, [field]: value }).success).toBe(false);
  });
});

describe("supplierListSchema", () => {
  it("accepts a list of suppliers, empty or not", () => {
    expect(supplierListSchema.safeParse([]).data).toEqual([]);
    expect(supplierListSchema.safeParse([norte, sur]).data).toEqual([norte, sur]);
  });

  it.each([undefined, null, {}, "suppliers", norte])("refuses %j as a list", (body) => {
    expect(supplierListSchema.safeParse(body).success).toBe(false);
  });
});
