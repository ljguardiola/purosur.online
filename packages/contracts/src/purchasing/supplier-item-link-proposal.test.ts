import { describe, expect, it } from "vitest";
import { supplierItemLinkProposalSchema } from "./supplier-item-link-proposal.js";

describe("supplierItemLinkProposalSchema", () => {
  it.each(["barcode", "ai"])("accepts a product proposed by %s", (by) => {
    const proposal = { kind: "proposed", by, product: { id: "p-1", name: "Yerba" } };

    expect(supplierItemLinkProposalSchema.safeParse(proposal).data).toEqual(proposal);
  });

  it.each([{ kind: "none" }, { kind: "unavailable" }])("accepts %j", (proposal) => {
    expect(supplierItemLinkProposalSchema.safeParse(proposal).data).toEqual(proposal);
  });

  it.each([
    { kind: "proposed", by: "guess", product: { id: "p-1", name: "Yerba" } },
    { kind: "proposed", by: "ai" },
    { kind: "proposed", by: "ai", product: { id: "p-1" } },
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
