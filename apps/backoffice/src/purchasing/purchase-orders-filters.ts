import { purchaseOrderListQuerySchema, recordIdSchema } from "@purosur/contracts";
import { z } from "zod";
import { reportFiltersFields, withoutRefusedPeriod } from "../shell/report-filters-search";

const STATES = purchaseOrderListQuerySchema.shape.state.unwrap().options;

export const purchaseOrdersFilterFields = z.object({
  state: z
    .enum(["ALL", "PENDING_RECEIPT", ...STATES])
    .default("ALL")
    .catch("ALL"),
  differences: z
    .union([z.boolean(), z.stringbool({ truthy: ["true"], falsy: ["false"] })])
    .default(false)
    .catch(false),
  from: reportFiltersFields.from,
  to: reportFiltersFields.to,
});

export const purchaseOrdersFilters = purchaseOrdersFilterFields.transform(withoutRefusedPeriod);

export type PurchaseOrdersFilters = z.output<typeof purchaseOrdersFilters>;

export function listsOrders(
  filters: Pick<PurchaseOrdersFilters, "state" | "differences">,
): boolean {
  return !filters.differences && filters.state !== "PENDING_RECEIPT";
}

export const purchaseOrdersListSearch = purchaseOrdersFilterFields
  .extend({
    supplier: recordIdSchema().optional().catch(undefined),
    order: recordIdSchema().optional().catch(undefined),
  })
  .transform(withoutRefusedPeriod)
  .transform((search) => (listsOrders(search) ? search : { ...search, supplier: undefined }));
