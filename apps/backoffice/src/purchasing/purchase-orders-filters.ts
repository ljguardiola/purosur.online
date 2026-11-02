import { z } from "zod";

export const purchaseOrdersFilters = z.object({
  state: z.enum(["ALL", "DRAFT", "SENT", "CANCELLED"]).default("ALL").catch("ALL"),
});

export type PurchaseOrdersFilters = z.output<typeof purchaseOrdersFilters>;
