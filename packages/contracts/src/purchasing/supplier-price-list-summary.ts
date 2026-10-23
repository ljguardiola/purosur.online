import { SUPPLIER_PRICE_LIST_READ_FAILURES, SUPPLIER_PRICE_LIST_STATES } from "@purosur/domain";
import { z } from "zod";

const supplierPriceListSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PDF"), fileName: z.string() }),
  z.object({ kind: z.literal("WEB_PAGE"), url: z.string() }),
]);

export const supplierPriceListSummarySchema = z.object({
  id: z.string(),
  supplier: z.object({ id: z.string(), name: z.string() }),
  source: supplierPriceListSourceSchema,
  listDate: z.string().nullable(),
  rowCount: z.int(),
  unpricedRowCount: z.int(),
  state: z.enum(SUPPLIER_PRICE_LIST_STATES),
  readFailure: z.enum(SUPPLIER_PRICE_LIST_READ_FAILURES).nullable(),
  uploadedAt: z.iso.datetime(),
  replaced: z.boolean(),
});

export const supplierPriceListListSchema = z.array(supplierPriceListSummarySchema);

export type SupplierPriceListSummary = z.output<typeof supplierPriceListSummarySchema>;
