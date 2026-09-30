import type {
  NewPinCode,
  PinCodeEmission,
  PinCodeStore,
  PinCodeStoreTransaction,
  PinCodeTarget,
} from "@purosur/domain/access/use-cases";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  roles,
  userPinCodes,
  userPins,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzlePinCodeStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PinCodeStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly locationId: string;

  constructor(tx: Transaction<TQueryResult>, locationId: string) {
    this.tx = tx;
    this.locationId = locationId;
  }

  async lockPinCodeTarget(userId: string): Promise<PinCodeTarget | undefined> {
    if (!UUID_PATTERN.test(userId)) {
      return undefined;
    }
    // Only the user's row is locked: NO KEY UPDATE serializes emissions for it while leaving the
    // foreign-key checks of the code and audit rows written below free to proceed.
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
    await this.tx.delete(userPins).where(eq(userPins.userId, userId));
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
    });
  }
}

export class DrizzlePinCodeStore<TQueryResult extends PgQueryResultHKT> implements PinCodeStore {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly locationId: string;

  constructor(db: PgDatabase<TQueryResult>, locationId: string) {
    this.db = db;
    this.locationId = locationId;
  }

  transaction<TOutcome>(
    work: (tx: PinCodeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzlePinCodeStoreTransaction(tx, this.locationId)),
    );
  }
}
