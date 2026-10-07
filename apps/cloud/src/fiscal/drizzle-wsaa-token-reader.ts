import type { WsaaToken, WsaaTokenReader } from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { arcaWsaaTokens } from "../platform/db/schema.js";

export class DrizzleWsaaTokenReader<TQueryResult extends PgQueryResultHKT>
  implements WsaaTokenReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async currentWsaaToken(
    service: string,
    certificateFingerprint: string,
  ): Promise<WsaaToken | null> {
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
          eq(arcaWsaaTokens.service, service),
          eq(arcaWsaaTokens.certificateFingerprint, certificateFingerprint),
        ),
      );
    return row ?? null;
  }
}
