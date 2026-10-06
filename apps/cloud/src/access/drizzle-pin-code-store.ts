import type {
  NewPinCode,
  PinCodeEmission,
  PinCodeStore,
  PinCodeStoreTransaction,
  PinCodeTarget,
} from "@purosur/domain/access/use-cases";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  roles,
  userPinCodes,
  userPins,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzlePinCodeStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PinCodeStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly now: () => Date;
  private readonly locationId: string;
  private readonly pending: PendingChanges;

  constructor(
    tx: Transaction<TQueryResult>,
    now: () => Date,
    locationId: string,
    pending: PendingChanges,
  ) {
    this.tx = tx;
    this.now = now;
    this.locationId = locationId;
    this.pending = pending;
  }

  async lockPinCodeTarget(userId: string): Promise<PinCodeTarget | undefined> {
    const [row] = await this.tx
      .select({ active: users.active, isAdministrator: roles.isAdministrator })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(users.id, userId), eq(users.locationId, this.locationId)))
      .for("no key update", { of: users });
    return row;
  }

  async pinCodesIssuedSince(userId: string, since: Date): Promise<Date[]> {
    const rows = await this.tx
      .select({ issuedAt: userPinCodes.issuedAt })
      .from(userPinCodes)
      .where(and(eq(userPinCodes.userId, userId), gt(userPinCodes.issuedAt, since)));
    return rows.map((row) => row.issuedAt);
  }

  async supersedeLivePinCodes(userId: string, supersededAt: Date): Promise<void> {
    await this.tx
      .update(userPinCodes)
      .set({ supersededAt })
      .where(
        and(
          eq(userPinCodes.userId, userId),
          isNull(userPinCodes.redeemedAt),
          isNull(userPinCodes.supersededAt),
        ),
      );
  }

  async removePin(userId: string): Promise<void> {
    const removed = await this.tx
      .delete(userPins)
      .where(eq(userPins.userId, userId))
      .returning({ userId: userPins.userId });
    if (removed.length === 0) {
      return;
    }
    // The register learns a PIN is gone only through a newer version of the user.
    const [user] = await this.tx
      .update(users)
      .set({ version: sql`${users.version} + 1` })
      .where(eq(users.id, userId))
      .returning({ version: users.version });
    if (!user) {
      throw new Error("a removed PIN had no user");
    }
    this.pending.note({
      entity: "user",
      entityId: userId,
      version: user.version,
      op: "update",
      locationId: this.locationId,
    });
  }

  async recordPinCode(pinCode: NewPinCode): Promise<void> {
    await this.tx.insert(userPinCodes).values(pinCode);
  }

  async recordPinCodeEmission(emission: PinCodeEmission): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "user",
      entityId: emission.userId,
      actorId: emission.actorId,
      newValue: { pin_code_expires_at: emission.expiresAt.toISOString() },
      at: this.now(),
    });
  }
}

export class DrizzlePinCodeStore<TQueryResult extends PgQueryResultHKT> implements PinCodeStore {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  private readonly locationId: string;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date, locationId: string) {
    this.db = db;
    this.now = now;
    this.locationId = locationId;
  }

  transaction<TOutcome>(
    work: (tx: PinCodeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzlePinCodeStoreTransaction(tx, this.now, this.locationId, pending)),
    );
  }
}
