import { purchaseOrderListQuerySchema } from "@purosur/contracts";
import { z } from "zod";

const STATES = purchaseOrderListQuerySchema.shape.state.unwrap().options;

export const purchaseOrdersFilters = z.object({
  state: z
    .enum(["ALL", ...STATES])
    .default("ALL")
    .catch("ALL"),
});

export type PurchaseOrdersFilters = z.output<typeof purchaseOrdersFilters>;
