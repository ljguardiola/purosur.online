import { expectTypeOf, test } from "vitest";
import type { SupplierItemLinkProposalReader } from "./supplier-item-link-proposal-reader.js";

test("a reader that cannot answer one product of a scope is not a proposal reader", () => {
  expectTypeOf<
    Omit<SupplierItemLinkProposalReader, "product">
  >().not.toExtend<SupplierItemLinkProposalReader>();
});
