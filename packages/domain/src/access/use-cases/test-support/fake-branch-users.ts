import type { BranchUserActiveScope, BranchUserFacts, BranchUsers } from "../branch-users.js";

export interface FakeBranchUser extends BranchUserFacts {
  locationId: string;
  permissionKeys?: string[];
}

function inScope(user: BranchUserFacts, scope: BranchUserActiveScope): boolean {
  return scope === "any" || user.active === (scope === "active");
}

export class FakeBranchUsers implements BranchUsers {
  private readonly seeded: FakeBranchUser[] = [];
  private readonly source: () => FakeBranchUser[];
  readonly lookups: string[] = [];

  constructor(source?: () => FakeBranchUser[]) {
    this.source = source ?? (() => this.seeded);
  }

  private get users(): FakeBranchUser[] {
    return this.source();
  }

  seedUser(user: FakeBranchUser): void {
    this.seeded.push(user);
  }

  async branchUsers(
    locationId: string,
    activeScope: BranchUserActiveScope,
  ): Promise<BranchUserFacts[]> {
    this.lookups.push("branchUsers");
    return this.users
      .filter((user) => user.locationId === locationId && inScope(user, activeScope))
      .sort((a, b) => a.firstName.localeCompare(b.firstName))
      .map(factsOf);
  }

  async branchUser(
    locationId: string,
    userId: string,
    activeScope: BranchUserActiveScope,
  ): Promise<BranchUserFacts | undefined> {
    this.lookups.push("branchUser");
    const found = this.users.find(
      (user) => user.id === userId && user.locationId === locationId && inScope(user, activeScope),
    );
    return found && factsOf(found);
  }

  async branchUserWithEmail(
    locationId: string,
    email: string,
    activeScope: BranchUserActiveScope,
  ): Promise<BranchUserFacts | undefined> {
    this.lookups.push("branchUserWithEmail");
    const found = this.users.find(
      (user) =>
        user.email === email && user.locationId === locationId && inScope(user, activeScope),
    );
    return found && factsOf(found);
  }

  async activeAdministratorCount(locationId: string): Promise<number> {
    this.lookups.push("activeAdministratorCount");
    return this.users.filter(
      (user) => user.locationId === locationId && user.active && user.roleIsAdministrator,
    ).length;
  }

  async activeUserPermissionKeys(locationId: string): Promise<string[]> {
    this.lookups.push("activeUserPermissionKeys");
    return this.users
      .filter((user) => user.locationId === locationId && user.active)
      .flatMap((user) => user.permissionKeys ?? []);
  }
}

function factsOf({
  locationId: _locationId,
  permissionKeys: _permissionKeys,
  ...facts
}: FakeBranchUser): BranchUserFacts {
  return facts;
}
