import { createHash } from "node:crypto";
import type {
  SignInLockoutAlert,
  SignInLockoutStore,
  SignInLockoutStoreTransaction,
  SourceAddressBlock,
} from "@purosur/domain/sessions/use-cases";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { signInFailures, signInLockouts } from "../platform/db/schema.js";

const PRUNE_BATCH_SIZE = 100;

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

/** The lockout tables key by the raw address, but a permanent audit row never stores it in the clear. */
export function hashSourceAddress(sourceAddress: string): string {
  return createHash("sha256").update(sourceAddress).digest("hex");
}

class DrizzleSignInLockoutStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements SignInLockoutStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async lockSourceAddress(sourceAddress: string): Promise<void> {
    await this.tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sourceAddress}, 0))`);
  }

  async pruneFailuresOutsideWindow(windowStart: Date): Promise<void> {
    const expired = this.tx
      .select({ id: signInFailures.id })
      .from(signInFailures)
      .where(lte(signInFailures.attemptedAt, windowStart))
      .limit(PRUNE_BATCH_SIZE)
      .for("update", { skipLocked: true });
    await this.tx.delete(signInFailures).where(inArray(signInFailures.id, expired));
  }

  async findBlockedUntil(sourceAddress: string): Promise<Date | undefined> {
    const [lockout] = await this.tx
      .select({ blockedUntil: signInLockouts.blockedUntil })
      .from(signInLockouts)
      .where(eq(signInLockouts.sourceAddress, sourceAddress))
      .limit(1);
    return lockout?.blockedUntil;
  }

  async countFailuresInWindow(sourceAddress: string, windowStart: Date): Promise<number> {
    const counted = await this.tx
      .select({ id: signInFailures.id })
      .from(signInFailures)
      .where(
        and(
          eq(signInFailures.sourceAddress, sourceAddress),
          gt(signInFailures.attemptedAt, windowStart),
        ),
      );
    return counted.length;
  }

  async recordFailure(sourceAddress: string, at: Date): Promise<string> {
    const [attempt] = await this.tx
      .insert(signInFailures)
      .values({ sourceAddress, attemptedAt: at })
      .returning({ id: signInFailures.id });
    if (!attempt) {
      throw new Error("sign-in attempt insert returned no row");
    }
    return attempt.id;
  }

  async blockSourceAddress(block: SourceAddressBlock): Promise<{ id: string }> {
    const [blocked] = await this.tx
      .insert(signInLockouts)
      .values(block)
      .onConflictDoUpdate({
        target: signInLockouts.sourceAddress,
        set: { blockedUntil: block.blockedUntil },
      })
      .returning({ id: signInLockouts.id });
    if (!blocked) {
      throw new Error("sign-in lockout upsert returned no row");
    }
    await this.tx
      .delete(signInFailures)
      .where(eq(signInFailures.sourceAddress, block.sourceAddress));
    return blocked;
  }

  async openLockoutAlert(alert: SignInLockoutAlert): Promise<void> {
    await openAlert(
      this.tx,
      {
        kind: "backoffice_sign_in_lockout",
        scope: alert.sourceAddress,
        detail: {
          sourceAddress: alert.sourceAddress,
          failureCount: alert.failureCount,
          blockedUntil: alert.blockedUntil.toISOString(),
        },
      },
      { now: () => alert.openedAt },
    );
  }
}

export class DrizzleSignInLockoutStore<TQueryResult extends PgQueryResultHKT>
  implements SignInLockoutStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: SignInLockoutStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleSignInLockoutStoreTransaction(tx)));
  }
}
