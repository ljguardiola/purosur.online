import type { PasskeyRemovalResult } from "@purosur/domain";
import {
  removeEveryUserPasskeyWithin,
  requirePinResetOfEveryUserWithin,
} from "@purosur/domain/credentials/use-cases";
import { revokeEveryInstallationWithin } from "@purosur/domain/register/use-cases";
import {
  type AccountPasskeyRemoval,
  type CompromiseResponseStore,
  type CompromiseResponseStoreTransaction,
  type CompromiseResponses,
  endEveryBackofficeSessionWithin,
  type InstallationRevocationResult,
  type StoredCompromiseResponse,
} from "@purosur/domain/sessions/use-cases";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzlePasskeyHolders } from "../credentials/drizzle-passkey-holders.js";
import { DrizzlePasskeyRemovalStoreTransaction } from "../credentials/drizzle-passkey-removal-store.js";
import { DrizzlePinResetStoreTransaction } from "../credentials/drizzle-pin-reset-store.js";
import {
  auditLog,
  compromiseResponseCompletions,
  compromiseResponses,
} from "../platform/db/schema.js";
import { DrizzleEveryInstallationRevocationTransaction } from "../register/drizzle-every-installation-revocation-store.js";
import { generateInstallationKey } from "../register/installation-key.js";
import {
  type InstallationKeyCipher,
  installationKeyCipher,
} from "../register/installation-key-cipher.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import { DrizzleBackofficeSessionEndingStoreTransaction } from "./drizzle-backoffice-session-ending-store.js";

export interface DrizzleCompromiseResponseStoreOptions {
  keysEncryptionKey: Uint8Array;
  now: () => Date;
}

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

type Reader<TQueryResult extends PgQueryResultHKT> =
  | PgDatabase<TQueryResult>
  | Transaction<TQueryResult>;

const RESPONSES_LOCK_KEY = "compromise_responses";

async function latestResponse<TQueryResult extends PgQueryResultHKT>(
  reader: Reader<TQueryResult>,
): Promise<StoredCompromiseResponse | null> {
  const [latest] = await reader
    .select()
    .from(compromiseResponses)
    .orderBy(desc(compromiseResponses.startedAt), desc(compromiseResponses.id))
    .limit(1);
  if (latest === undefined) {
    return null;
  }
  const completions = await reader
    .select({ key: compromiseResponseCompletions.key, at: compromiseResponseCompletions.doneAt })
    .from(compromiseResponseCompletions)
    .where(eq(compromiseResponseCompletions.responseId, latest.id))
    .orderBy(asc(compromiseResponseCompletions.doneAt), asc(compromiseResponseCompletions.key));
  return {
    id: latest.id,
    startedAt: latest.startedAt,
    startedBy: latest.startedBy,
    completions: completions as StoredCompromiseResponse["completions"],
  };
}

class DrizzleCompromiseResponseStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements CompromiseResponseStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly pending: PendingChanges;
  private readonly cipher: InstallationKeyCipher;
  private readonly now: () => Date;

  constructor(
    tx: Transaction<TQueryResult>,
    pending: PendingChanges,
    cipher: InstallationKeyCipher,
    now: () => Date,
  ) {
    this.tx = tx;
    this.pending = pending;
    this.cipher = cipher;
    this.now = now;
  }

  async lockLatestResponse(): Promise<StoredCompromiseResponse | null> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${RESPONSES_LOCK_KEY}, 0))`,
    );
    return latestResponse(this.tx);
  }

  async startResponse(actorId: string, at: Date): Promise<StoredCompromiseResponse> {
    const [started] = await this.tx
      .insert(compromiseResponses)
      .values({ startedAt: at, startedBy: actorId })
      .returning({ id: compromiseResponses.id });
    if (started === undefined) {
      throw new Error("the started runbook returned no row");
    }
    await this.tx.insert(auditLog).values({
      entity: "compromise_response",
      entityId: started.id,
      actorId,
      newValue: { started_at: at.toISOString() },
      at,
    });
    return { id: started.id, startedAt: at, startedBy: actorId, completions: [] };
  }

  async recordStepDone(
    responseId: string,
    step: Parameters<CompromiseResponseStoreTransaction["recordStepDone"]>[1],
    actorId: string,
    at: Date,
  ): Promise<void> {
    await this.tx
      .insert(compromiseResponseCompletions)
      .values({ responseId, key: step, doneBy: actorId, doneAt: at });
    await this.tx.insert(auditLog).values({
      entity: "compromise_response",
      entityId: responseId,
      actorId,
      newValue: { step, done_at: at.toISOString() },
      at,
    });
  }

  async recordItemDone(
    responseId: string,
    item: Parameters<CompromiseResponseStoreTransaction["recordItemDone"]>[1],
    actorId: string,
    at: Date,
  ): Promise<void> {
    await this.tx
      .insert(compromiseResponseCompletions)
      .values({ responseId, key: item, doneBy: actorId, doneAt: at });
    await this.tx.insert(auditLog).values({
      entity: "compromise_response",
      entityId: responseId,
      actorId,
      newValue: { item, done_at: at.toISOString() },
      at,
    });
  }

  async revokeEveryInstallation(actorId: string, at: Date): Promise<InstallationRevocationResult> {
    const { kind } = await revokeEveryInstallationWithin(
      new DrizzleEveryInstallationRevocationTransaction(this.tx, this.cipher, this.now),
      { clock: { now: () => at }, keys: { generate: generateInstallationKey } },
      { actorId },
    );
    return kind;
  }

  async removeEveryPasskeyOf(removal: AccountPasskeyRemoval): Promise<PasskeyRemovalResult> {
    const { kind } = await removeEveryUserPasskeyWithin(
      new DrizzlePasskeyRemovalStoreTransaction(this.tx, this.now),
      drizzlePasskeyHolders(this.tx),
      {
        locationId: removal.locationId,
        administratorId: removal.administratorId,
        targetUserId: removal.accountId,
        passkeyAuthorizedAt: removal.passkeyAuthorizedAt,
        at: removal.at,
      },
    );
    return kind;
  }

  async endEveryBackofficeSession(actorId: string, at: Date): Promise<void> {
    await endEveryBackofficeSessionWithin(
      new DrizzleBackofficeSessionEndingStoreTransaction(this.tx),
      { actorId, at },
    );
  }

  async requirePinResetOfEveryUser(actorId: string, at: Date): Promise<void> {
    await requirePinResetOfEveryUserWithin(
      new DrizzlePinResetStoreTransaction(this.tx, this.pending, () => at),
      { actorId },
    );
  }
}

export class DrizzleCompromiseResponseStore<TQueryResult extends PgQueryResultHKT>
  implements CompromiseResponseStore, CompromiseResponses
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;
  private readonly now: () => Date;

  constructor(
    db: PgDatabase<TQueryResult>,
    { keysEncryptionKey, now }: DrizzleCompromiseResponseStoreOptions,
  ) {
    this.db = db;
    this.cipher = installationKeyCipher(keysEncryptionKey);
    this.now = now;
  }

  findLatestResponse(): Promise<StoredCompromiseResponse | null> {
    return latestResponse(this.db);
  }

  transaction<TOutcome>(
    work: (tx: CompromiseResponseStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzleCompromiseResponseStoreTransaction(tx, pending, this.cipher, this.now)),
    );
  }
}
