import type {
  PendingPasskeyChallenge,
  PendingPasskeyChallengeSlot,
  PendingPasskeyChallengeStore,
  PendingPasskeyChallengeStoreTransaction,
} from "@purosur/domain/access/use-cases";
import { and, eq, inArray, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { passkeyChallenges } from "../platform/db/schema.js";

const PRUNE_BATCH_SIZE = 100;

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzlePendingPasskeyChallengeStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PendingPasskeyChallengeStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async discardChallengesIssuedAtOrBefore(cutoff: Date): Promise<void> {
    const expired = this.tx
      .select({ id: passkeyChallenges.id })
      .from(passkeyChallenges)
      .where(lte(passkeyChallenges.createdAt, cutoff))
      .limit(PRUNE_BATCH_SIZE)
      .for("update", { skipLocked: true });
    await this.tx.delete(passkeyChallenges).where(inArray(passkeyChallenges.id, expired));
  }

  // Constraint `passkey_challenges_session_id_kind_key` enforces one live row per `(session_id, kind)`.
  async storeChallenge(challenge: PendingPasskeyChallenge): Promise<void> {
    const values = {
      sessionId: challenge.sessionId,
      kind: challenge.kind,
      reauthenticationChallenge:
        challenge.kind === "session_authorization" ? challenge.challenge : null,
      registrationChallenge: challenge.kind === "registration" ? challenge.challenge : null,
      createdAt: challenge.issuedAt,
    };
    await this.tx
      .insert(passkeyChallenges)
      .values(values)
      .onConflictDoUpdate({
        target: [passkeyChallenges.sessionId, passkeyChallenges.kind],
        set: values,
      });
  }

  async takeChallenge(
    slot: PendingPasskeyChallengeSlot,
  ): Promise<{ challenge: string; issuedAt: Date } | undefined> {
    const [row] = await this.tx
      .delete(passkeyChallenges)
      .where(
        and(eq(passkeyChallenges.sessionId, slot.sessionId), eq(passkeyChallenges.kind, slot.kind)),
      )
      .returning({
        reauthenticationChallenge: passkeyChallenges.reauthenticationChallenge,
        registrationChallenge: passkeyChallenges.registrationChallenge,
        createdAt: passkeyChallenges.createdAt,
      });
    const challenge =
      slot.kind === "registration" ? row?.registrationChallenge : row?.reauthenticationChallenge;
    if (!row || !challenge) {
      return undefined;
    }
    return { challenge, issuedAt: row.createdAt };
  }
}

export class DrizzlePendingPasskeyChallengeStore<TQueryResult extends PgQueryResultHKT>
  implements PendingPasskeyChallengeStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: PendingPasskeyChallengeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzlePendingPasskeyChallengeStoreTransaction(tx)),
    );
  }
}
