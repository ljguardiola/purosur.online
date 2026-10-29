import { z } from "zod";
import { netContentSchema } from "../shared/index.js";

export const supplierItemLinkProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("proposed"),
    by: z.enum(["barcode", "ai"]),
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
