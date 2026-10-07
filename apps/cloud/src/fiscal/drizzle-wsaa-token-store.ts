import type {
  WsaaToken,
  WsaaTokenStore,
  WsaaTokenStoreTransaction,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { arcaWsaaTokens } from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

export function wsaaTokenLockKey(service: string, certificateFingerprint: string): string {
  return `wsaa_token:${service}:${certificateFingerprint}`;
}

class DrizzleWsaaTokenStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements WsaaTokenStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async lockWsaaToken(service: string, certificateFingerprint: string): Promise<WsaaToken | null> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${wsaaTokenLockKey(service, certificateFingerprint)}, 0))`,
    );
    const [row] = await this.tx
      .select({
        token: arcaWsaaTokens.token,
        sign: arcaWsaaTokens.sign,
        issuedAt: arcaWsaaTokens.issuedAt,
        expiresAt: arcaWsaaTokens.expiresAt,
      })
      .from(arcaWsaaTokens)
      .where(
        and(
          eq(arcaWsaaTokens.service, service),
          eq(arcaWsaaTokens.certificateFingerprint, certificateFingerprint),
        ),
      );
    return row ?? null;
  }

  async recordWsaaToken(
    service: string,
    certificateFingerprint: string,
    { token, sign, issuedAt, expiresAt }: WsaaToken,
  ): Promise<void> {
    await this.tx
      .insert(arcaWsaaTokens)
      .values({ service, certificateFingerprint, token, sign, issuedAt, expiresAt })
      .onConflictDoUpdate({
        target: [arcaWsaaTokens.service, arcaWsaaTokens.certificateFingerprint],
        set: { token, sign, issuedAt, expiresAt },
      });
  }
}

export class DrizzleWsaaTokenStore<TQueryResult extends PgQueryResultHKT>
  implements WsaaTokenStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: WsaaTokenStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleWsaaTokenStoreTransaction(tx)));
  }
}
