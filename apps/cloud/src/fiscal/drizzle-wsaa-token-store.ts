import type { WsaaToken, WsaaTokenRenewal, WsaaTokenStore } from "@purosur/domain/fiscal/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { arcaWsaaTokens } from "../platform/db/schema.js";

export function wsaaTokenLockKey(service: string, certificateFingerprint: string): string {
  return `wsaa_token:${service}:${certificateFingerprint}`;
}

class DrizzleWsaaTokenRenewal<TQueryResult extends PgQueryResultHKT> implements WsaaTokenRenewal {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly service: string;
  private readonly certificateFingerprint: string;

  constructor(db: PgDatabase<TQueryResult>, service: string, certificateFingerprint: string) {
    this.db = db;
    this.service = service;
    this.certificateFingerprint = certificateFingerprint;
  }

  async persistedToken(): Promise<WsaaToken | null> {
    const [row] = await this.db
      .select({
        token: arcaWsaaTokens.token,
        sign: arcaWsaaTokens.sign,
        issuedAt: arcaWsaaTokens.issuedAt,
        expiresAt: arcaWsaaTokens.expiresAt,
      })
      .from(arcaWsaaTokens)
      .where(
        and(
          eq(arcaWsaaTokens.service, this.service),
          eq(arcaWsaaTokens.certificateFingerprint, this.certificateFingerprint),
        ),
      );
    return row ?? null;
  }

  async recordIssuedToken({ token, sign, issuedAt, expiresAt }: WsaaToken): Promise<void> {
    await this.db
      .insert(arcaWsaaTokens)
      .values({
        service: this.service,
        certificateFingerprint: this.certificateFingerprint,
        token,
        sign,
        issuedAt,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [arcaWsaaTokens.service, arcaWsaaTokens.certificateFingerprint],
        set: { token, sign, issuedAt, expiresAt },
      });
  }
}

// The renewal holds a session-level advisory lock and records in autocommit, so the database
// handle must be bound to one connection for the whole renewal: the lock and its release have to
// run on the connection that took it.
export class DrizzleWsaaTokenStore<TQueryResult extends PgQueryResultHKT>
  implements WsaaTokenStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async holdRenewal<TOutcome>(
    service: string,
    certificateFingerprint: string,
    work: (renewal: WsaaTokenRenewal) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const key = sql`hashtextextended(${wsaaTokenLockKey(service, certificateFingerprint)}, 0)`;
    await this.db.execute(sql`select pg_advisory_lock(${key})`);
    try {
      return await work(new DrizzleWsaaTokenRenewal(this.db, service, certificateFingerprint));
    } finally {
      await this.db.execute(sql`select pg_advisory_unlock(${key})`);
    }
  }
}
