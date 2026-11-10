import type { z } from "zod";
import { editableBranchSettingsSchema } from "./editable-branch-settings.js";

export const goodConditionReturnDaysBodySchema = editableBranchSettingsSchema.pick({
  good_condition_return_days: true,
});

export const supplierPriceListDailyCapBodySchema = editableBranchSettingsSchema.pick({
  supplier_price_list_daily_extraction_cap: true,
});

export type GoodConditionReturnDaysBody = z.output<typeof goodConditionReturnDaysBodySchema>;
export type SupplierPriceListDailyCapBody = z.output<typeof supplierPriceListDailyCapBodySchema>;
