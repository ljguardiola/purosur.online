import { describe, expect, it } from "vitest";
import { supplierItemLinkProposalSchema } from "./supplier-item-link-proposal.js";

const PRODUCT = {
  id: "p-1",
  name: "Yerba",
  brandName: "Piragüé",
  netContent: { quantity: 500, unit: "G" },
};

describe("supplierItemLinkProposalSchema", () => {
  it.each(["barcode", "ai"])("accepts a product proposed by %s", (by) => {
    const proposal = { kind: "proposed", by, product: PRODUCT };

    expect(supplierItemLinkProposalSchema.safeParse(proposal).data).toEqual(proposal);
  });

  it("accepts a product with neither brand nor net content", () => {
    const proposal = {
      kind: "proposed",
      by: "ai",
      product: { id: "p-1", name: "Yerba", brandName: null, netContent: null },
    };

    expect(supplierItemLinkProposalSchema.safeParse(proposal).data).toEqual(proposal);
  });

  it.each([{ kind: "none" }, { kind: "unavailable" }])("accepts %j", (proposal) => {
    expect(supplierItemLinkProposalSchema.safeParse(proposal).data).toEqual(proposal);
  });

  it.each([
    { kind: "proposed", by: "guess", product: PRODUCT },
    { kind: "proposed", by: "ai" },
    { kind: "proposed", by: "ai", product: { id: "p-1" } },
    { kind: "proposed", by: "ai", product: { id: "p-1", name: "Yerba", netContent: null } },
    { kind: "proposed", by: "ai", product: { id: "p-1", name: "Yerba", brandName: null } },
    {
      kind: "proposed",
      by: "ai",
      product: { ...PRODUCT, netContent: { quantity: 1, unit: "OZ" } },
    },
    { kind: "chosen" },
    {},
  ])("refuses %j", (proposal) => {
    expect(supplierItemLinkProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("strips what a proposal without a product does not define", () => {
    expect(supplierItemLinkProposalSchema.safeParse({ kind: "none", by: "ai" }).data).toEqual({
      kind: "none",
    });
  });
});
