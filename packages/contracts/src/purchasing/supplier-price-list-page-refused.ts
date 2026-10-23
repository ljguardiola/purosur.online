import { SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS } from "@purosur/domain";
import { z } from "zod";

export const supplierPriceListPageRefusedSchema = z.object({
  code: z.literal("page_refused"),
  message: z.string(),
  reason: z.enum(SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS),
});

export type SupplierPriceListPageRefused = z.infer<typeof supplierPriceListPageRefusedSchema>;
