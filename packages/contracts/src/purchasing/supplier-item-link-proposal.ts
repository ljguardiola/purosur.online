import { z } from "zod";
import { netContentSchema } from "../shared/index.js";
import { refreshSchema } from "./supplier-item-proposal-refresh.js";
import { supplierItemQuantitySchema } from "./supplier-price-list-row-link.js";

export const supplierItemLinkProposalBodySchema = z.object({
  refresh: refreshSchema,
});

export type SupplierItemLinkProposalBody = z.input<typeof supplierItemLinkProposalBodySchema>;

export const supplierItemLinkProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("proposed"),
    by: z.enum(["barcode", "ai"]),
    quantity: supplierItemQuantitySchema.nullable(),
    product: z.object({
      id: z.string(),
      name: z.string(),
      brandName: z.string().nullable(),
      netContent: netContentSchema.nullable(),
    }),
  }),
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("unavailable") }),
]);

export type SupplierItemLinkProposal = z.output<typeof supplierItemLinkProposalSchema>;
