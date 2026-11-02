import { z } from "zod";

export const purchaseOrdersFilters = z.object({
  state: z.enum(["ALL", "DRAFT", "CANCELLED"]).default("ALL").catch("ALL"),
});

export type PurchaseOrdersFilters = z.output<typeof purchaseOrdersFilters>;
