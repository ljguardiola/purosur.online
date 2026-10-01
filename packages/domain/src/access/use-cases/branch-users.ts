export type BranchUserActiveScope = "active" | "inactive" | "any";

export interface BranchUserFacts {
  id: string;
  firstName: string;
  email: string;
  version: number;
  active: boolean;
  roleId: string;
  roleName: string | null;
  roleIsAdministrator: boolean;
  passkeyCount: number;
}

export interface BranchUser extends BranchUserFacts {
  isLastActiveAdministrator: boolean;
}

export interface EmailHolder {
  id: string;
  firstName: string;
  active: boolean;
  locationId: string;
}

export interface BranchUsers {
  // Ordered by first name.
  branchUsers(locationId: string, activeScope: BranchUserActiveScope): Promise<BranchUserFacts[]>;
  // A malformed id is no user.
  branchUser(
    locationId: string,
    userId: string,
    activeScope: BranchUserActiveScope,
  ): Promise<BranchUserFacts | undefined>;
  activeAdministratorCount(locationId: string): Promise<number>;
  // Across every branch.
  emailHolder(email: string): Promise<EmailHolder | undefined>;
}
