import type { BranchWeeklyHoursRange } from "../../branch/index.js";

export interface BranchHoursReader {
  branchHours(locationId: string): Promise<BranchWeeklyHoursRange[]>;
}
