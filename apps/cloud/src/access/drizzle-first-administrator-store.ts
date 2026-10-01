import type {
  FirstAdministratorLocation,
  FirstAdministratorRole,
  FirstAdministratorStore,
  FirstAdministratorStoreTransaction,
  NewFirstAdministrator,
  StoredFirstAdministrator,
} from "@purosur/domain/access/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, locations, roles, userRoles, users } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleFirstAdministratorStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements FirstAdministratorStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly pending: PendingChanges;

  constructor(tx: Transaction<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async lockUsers(): Promise<void> {
    await this.tx.execute(sql`LOCK TABLE users IN EXCLUSIVE MODE`);
  }

  async anyUserExists(): Promise<boolean> {
    const existing = await this.tx.select({ id: users.id }).from(users).limit(1);
    return existing.length > 0;
  }

  async findAdministratorRole(): Promise<FirstAdministratorRole | undefined> {
    const [role] = await this.tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true))
      .limit(1);
    return role;
  }

  async findLocation(): Promise<FirstAdministratorLocation | undefined> {
    const [location] = await this.tx.select({ id: locations.id }).from(locations).limit(1);
    return location;
  }

  async insertUser(user: NewFirstAdministrator): Promise<StoredFirstAdministrator> {
    const [created] = await this.tx
      .insert(users)
      .values({ firstName: user.firstName, email: user.email, locationId: user.locationId })
      .returning({ id: users.id, version: users.version });
    if (!created) {
      throw new Error("inserting the first administrator returned no row");
    }
    this.pending.note({
      entity: "user",
      entityId: created.id,
      version: created.version,
      op: "insert",
      locationId: user.locationId,
    });
    return { id: created.id };
  }

  async assignRole(userId: string, roleId: string): Promise<void> {
    await this.tx.insert(userRoles).values({ userId, roleId });
  }

  async recordFirstAdministrator(
    userId: string,
    created: { firstName: string; email: string; roleId: string },
  ): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "user",
      entityId: userId,
      actorId: userId,
      previousValue: null,
      newValue: created,
    });
  }
}

export class DrizzleFirstAdministratorStore<TQueryResult extends PgQueryResultHKT>
  implements FirstAdministratorStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: FirstAdministratorStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzleFirstAdministratorStoreTransaction(tx, pending)),
    );
  }
}
