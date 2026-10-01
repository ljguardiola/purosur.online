import type {
  BranchUserActiveScope,
  BranchUserFacts,
  BranchUsers,
  EmailHolder,
} from "../branch-users.js";

export interface FakeBranchUser extends BranchUserFacts {
  locationId: string;
}

function inScope(user: BranchUserFacts, scope: BranchUserActiveScope): boolean {
  return scope === "any" || user.active === (scope === "active");
}

export class FakeBranchUsers implements BranchUsers {
  private readonly seeded: FakeBranchUser[] = [];
  private readonly source: () => FakeBranchUser[];

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
    const found = this.users.find(
      (user) => user.id === userId && user.locationId === locationId && inScope(user, activeScope),
    );
    return found && factsOf(found);
  }

  async activeAdministratorCount(locationId: string): Promise<number> {
    return this.users.filter(
      (user) => user.locationId === locationId && user.active && user.roleIsAdministrator,
    ).length;
  }

  async emailHolder(email: string): Promise<EmailHolder | undefined> {
    const found = this.users.find((user) => user.email === email);
    return (
      found && {
        id: found.id,
        firstName: found.firstName,
        active: found.active,
        locationId: found.locationId,
      }
    );
  }
}

function factsOf({ locationId: _locationId, ...facts }: FakeBranchUser): BranchUserFacts {
  return facts;
}
