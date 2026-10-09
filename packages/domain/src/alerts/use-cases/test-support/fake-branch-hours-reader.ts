import type { BranchWeeklyHoursRange } from "../../../branch/index.js";
import type { BranchHoursReader } from "../branch-hours-reader.js";

export class FakeBranchHoursReader implements BranchHoursReader {
  reads: string[] = [];
  private readonly hoursOfBranch: Record<string, BranchWeeklyHoursRange[]>;

  constructor(hoursOfBranch: Record<string, BranchWeeklyHoursRange[]>) {
    this.hoursOfBranch = structuredClone(hoursOfBranch);
  }

  async branchHours(locationId: string): Promise<BranchWeeklyHoursRange[]> {
    this.reads.push(locationId);
    return structuredClone(this.hoursOfBranch[locationId] ?? []);
  }
}
