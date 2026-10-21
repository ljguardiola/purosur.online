import type { ReplenishedUser } from "../model/replenished-user.js";

export interface RegisterBranchUsers {
  branchUsers(registerId: string): Promise<ReplenishedUser[]>;
}
