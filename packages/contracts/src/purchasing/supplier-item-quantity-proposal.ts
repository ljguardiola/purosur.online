import { SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import {
  checkNetContentQuantity,
  NET_CONTENT_QUANTITY_CHECK_OPTIONS,
  productNetContentSchema,
} from "../shared/index.js";
import { supplierItemQuantitySchema } from "./supplier-price-list-row-link.js";

export const supplierItemQuantityProposalBodySchema = z
  .object({
    saleUnit: z.enum(SALE_UNITS, { error: "saleUnit must be UNIT or KG" }),
    netContent: productNetContentSchema,
  })
  .superRefine(checkNetContentQuantity, NET_CONTENT_QUANTITY_CHECK_OPTIONS);

export type SupplierItemQuantityProposalBody = z.input<
  typeof supplierItemQuantityProposalBodySchema
>;

export const supplierItemQuantityProposalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("proposed"), quantity: supplierItemQuantitySchema }),
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("unavailable") }),
]);

export type SupplierItemQuantityProposal = z.output<typeof supplierItemQuantityProposalSchema>;
