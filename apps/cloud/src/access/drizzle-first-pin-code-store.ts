import type {
  FirstPinCodeEmission,
  FirstPinCodeStore,
  FirstPinCodeStoreTransaction,
  FirstPinCodeTarget,
  NewPinCode,
} from "@purosur/domain/access/use-cases";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, registers, userPinCodes, userPins, users } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleFirstPinCodeStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements FirstPinCodeStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async lockFirstPinCodeTarget(
    registerId: string,
    userId: string,
  ): Promise<FirstPinCodeTarget | undefined> {
    if (!UUID_PATTERN.test(userId)) {
      return undefined;
    }
    const [row] = await this.tx
      .select({ active: users.active, email: users.email, pinUserId: userPins.userId })
      .from(users)
      .innerJoin(registers, eq(registers.locationId, users.locationId))
      .leftJoin(userPins, eq(userPins.userId, users.id))
      .where(and(eq(registers.id, registerId), eq(users.id, userId)))
      .for("no key update", { of: users });
    return row && { active: row.active, email: row.email, hasPin: row.pinUserId !== null };
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

  async recordPinCode(pinCode: NewPinCode): Promise<void> {
    await this.tx.insert(userPinCodes).values(pinCode);
  }

  async recordFirstPinCodeEmission(emission: FirstPinCodeEmission): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "user",
      entityId: emission.userId,
      actorId: null,
      newValue: {
        first_pin_code_expires_at: emission.expiresAt.toISOString(),
        register_id: emission.registerId,
      },
    });
  }
}

export class DrizzleFirstPinCodeStore<TQueryResult extends PgQueryResultHKT>
  implements FirstPinCodeStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: FirstPinCodeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleFirstPinCodeStoreTransaction(tx)));
  }
}
