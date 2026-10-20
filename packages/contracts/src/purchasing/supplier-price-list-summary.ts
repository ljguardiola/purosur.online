import {
  SUPPLIER_PRICE_LIST_READ_FAILURES,
  SUPPLIER_PRICE_LIST_SOURCE_KINDS,
  SUPPLIER_PRICE_LIST_STATES,
} from "@purosur/domain";
import { z } from "zod";

export const supplierPriceListSummarySchema = z.object({
  id: z.string(),
  supplier: z.object({ id: z.string(), name: z.string() }),
  sourceKind: z.enum(SUPPLIER_PRICE_LIST_SOURCE_KINDS),
  fileName: z.string(),
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
