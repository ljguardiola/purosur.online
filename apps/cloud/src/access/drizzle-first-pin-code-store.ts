import type {
  FirstPinCodeEmission,
  FirstPinCodeStore,
  FirstPinCodeStoreTransaction,
  FirstPinCodeTarget,
  NewPinCode,
  QueuedFirstPinCodeEmail,
} from "@purosur/domain/access/use-cases";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, registers, userPinCodes, userPins, users } from "../platform/db/schema.js";
import {
  type EnqueueFirstPinCodeEmail,
  enqueueFirstPinCodeEmailJob,
} from "./graphile-first-pin-code-email-queue.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleFirstPinCodeStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements FirstPinCodeStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly enqueueEmail: EnqueueFirstPinCodeEmail;

  constructor(tx: Transaction<TQueryResult>, enqueueEmail: EnqueueFirstPinCodeEmail) {
    this.tx = tx;
    this.enqueueEmail = enqueueEmail;
  }

  async lockFirstPinCodeTarget(
    registerId: string,
    userId: string,
  ): Promise<FirstPinCodeTarget | undefined> {
    const [row] = await this.tx
      .select({ active: users.active, email: users.email })
      .from(users)
      .innerJoin(registers, eq(registers.locationId, users.locationId))
      .where(and(eq(registers.id, registerId), eq(users.id, userId)))
      .for("no key update", { of: users });
    if (!row) {
      return undefined;
    }
    // Read after the lock, not joined into it: a PIN committed while this waited on the lock is
    // only visible to a statement that starts afterwards.
    const [pin] = await this.tx
      .select({ userId: userPins.userId })
      .from(userPins)
      .where(eq(userPins.userId, userId));
    return { active: row.active, email: row.email, hasPin: pin !== undefined };
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

  queueFirstPinCodeEmail(email: QueuedFirstPinCodeEmail): Promise<void> {
    return this.enqueueEmail(this.tx, email);
  }
}

export class DrizzleFirstPinCodeStore<TQueryResult extends PgQueryResultHKT>
  implements FirstPinCodeStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly enqueueEmail: EnqueueFirstPinCodeEmail;

  constructor(
    db: PgDatabase<TQueryResult>,
    enqueueEmail: EnqueueFirstPinCodeEmail = enqueueFirstPinCodeEmailJob,
  ) {
    this.db = db;
    this.enqueueEmail = enqueueEmail;
  }

  transaction<TOutcome>(
    work: (tx: FirstPinCodeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleFirstPinCodeStoreTransaction(tx, this.enqueueEmail)),
    );
  }
}
