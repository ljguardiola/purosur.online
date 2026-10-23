import { z } from "zod";
import { branchSettingsSchema } from "../shared/index.js";

export const editableBranchSettingsSchema = branchSettingsSchema.extend({
  supplier_price_list_daily_extraction_cap: z.int(),
});

export type EditableBranchSettingsBody = z.output<typeof editableBranchSettingsSchema>;
