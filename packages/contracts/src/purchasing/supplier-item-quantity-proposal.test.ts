import { describe, expect, it } from "vitest";
import {
  supplierItemQuantityProposalBodySchema,
  supplierItemQuantityProposalSchema,
} from "./supplier-item-quantity-proposal.js";

function firstFailure(candidate: unknown): { field: unknown; message: unknown } | undefined {
  const result = supplierItemQuantityProposalBodySchema.safeParse(candidate);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("supplierItemQuantityProposalBodySchema", () => {
  it.each([undefined, "", "KILO", 1])("names the sale unit when it is %j", (saleUnit) => {
    expect(firstFailure({ saleUnit })).toEqual({
      field: "saleUnit",
      message: "saleUnit must be UNIT or KG",
    });
  });

  it.each([0, -5, 1.2345])("names the net content's quantity when it is %j", (quantity) => {
    expect(firstFailure({ saleUnit: "UNIT", netContent: { quantity, unit: "G" } })).toEqual({
      field: "netContentQuantity",
      message: expect.stringContaining("netContent's quantity must be a positive number"),
    });
  });

  it("reads the sale unit and the net content", () => {
    const body = { saleUnit: "KG", netContent: { quantity: 250, unit: "G" } };

    expect(supplierItemQuantityProposalBodySchema.safeParse(body).data).toEqual(body);
  });

  it.each([{ saleUnit: "UNIT" }, { saleUnit: "UNIT", netContent: null }])(
    "reads %j as a product with no net content",
    (body) => {
      expect(supplierItemQuantityProposalBodySchema.safeParse(body).data).toEqual({
        saleUnit: "UNIT",
        netContent: null,
      });
    },
  );

  it.each([
    {},
    { saleUnit: "KILO" },
    { saleUnit: 1 },
    { saleUnit: "UNIT", netContent: { quantity: 1, unit: "OZ" } },
    { saleUnit: "UNIT", netContent: { quantity: 0, unit: "G" } },
    { saleUnit: "UNIT", netContent: { quantity: -5, unit: "G" } },
    { saleUnit: "UNIT", netContent: { quantity: 1.2345, unit: "G" } },
  ])("refuses %j", (body) => {
    expect(supplierItemQuantityProposalBodySchema.safeParse(body).success).toBe(false);
  });
});

describe("supplierItemQuantityProposalSchema", () => {
  it.each([
    { kind: "proposed", quantity: 36_000 },
    { kind: "proposed", quantity: 500 },
    { kind: "none" },
    { kind: "unavailable" },
  ])("accepts %j", (proposal) => {
    expect(supplierItemQuantityProposalSchema.safeParse(proposal).data).toEqual(proposal);
  });

  it.each([
    { kind: "proposed" },
    { kind: "proposed", quantity: null },
    { kind: "proposed", quantity: 0 },
    { kind: "proposed", quantity: -1_000 },
    { kind: "proposed", quantity: 1.5 },
    { kind: "proposed", quantity: "36000" },
    { kind: "chosen" },
    {},
  ])("refuses %j", (proposal) => {
    expect(supplierItemQuantityProposalSchema.safeParse(proposal).success).toBe(false);
  });
});
