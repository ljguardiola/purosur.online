import { z } from "zod";

export const supplierItemLinkProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("proposed"),
    by: z.enum(["barcode", "ai"]),
    product: z.object({ id: z.string(), name: z.string() }),
  }),
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("unavailable") }),
]);

export type SupplierItemLinkProposal = z.output<typeof supplierItemLinkProposalSchema>;
