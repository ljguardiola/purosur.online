import { z } from "zod";
import { branchSettingsSchema } from "../shared/index.js";

export const editableBranchSettingsSchema = branchSettingsSchema.extend({
  supplier_price_list_daily_extraction_cap: z.int(),
});

export const branchSettingsReadSchema = editableBranchSettingsSchema.extend({
  zone_rules_version: z.string().min(1).nullable(),
});

export type BranchSettingsReadBody = z.output<typeof branchSettingsReadSchema>;

export type EditableBranchSettingsBody = z.output<typeof editableBranchSettingsSchema>;
