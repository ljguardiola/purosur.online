import type { LocalDatabaseMigrations } from "../local-database-migrations.js";

export class FakeLocalDatabaseMigrations implements LocalDatabaseMigrations {
  readonly appliedNames: readonly string[];
  readonly knownNames: readonly string[];
  readonly unreadable: Error | undefined;

  constructor(
    state: { applied?: readonly string[]; known?: readonly string[]; unreadable?: Error } = {},
  ) {
    this.appliedNames = state.applied ?? ["0000_a"];
    this.knownNames = state.known ?? ["0000_a"];
    this.unreadable = state.unreadable;
  }

  async appliedMigrationNames(): Promise<readonly string[]> {
    if (this.unreadable !== undefined) {
      throw this.unreadable;
    }
    return this.appliedNames;
  }

  knownMigrationNames(): readonly string[] {
    return this.knownNames;
  }
}
