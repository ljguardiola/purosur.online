export interface FirstAdministratorRole {
  id: string;
}

export interface FirstAdministratorLocation {
  id: string;
}

export interface NewFirstAdministrator {
  firstName: string;
  email: string;
  locationId: string;
}

export interface StoredFirstAdministrator {
  id: string;
}

export interface FirstAdministratorStore {
  transaction<TOutcome>(
    work: (tx: FirstAdministratorStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface FirstAdministratorStoreTransaction {
  // Serializes concurrent runs: only one can pass the "no users yet" check.
  lockUsers(): Promise<void>;
  anyUserExists(): Promise<boolean>;
  findAdministratorRole(): Promise<FirstAdministratorRole | undefined>;
  findLocation(): Promise<FirstAdministratorLocation | undefined>;
  insertUser(user: NewFirstAdministrator): Promise<StoredFirstAdministrator>;
  assignRole(userId: string, roleId: string): Promise<void>;
  recordFirstAdministrator(
    userId: string,
    created: { firstName: string; email: string; roleId: string },
  ): Promise<void>;
}
