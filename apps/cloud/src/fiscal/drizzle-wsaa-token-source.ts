import { isWsaaTokenValid } from "@purosur/domain";
import type { WsaaToken, WsaaTokenSource } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleWsaaTokenReader } from "./drizzle-wsaa-token-reader.js";

export class DrizzleWsaaTokenSource<TQueryResult extends PgQueryResultHKT>
  implements WsaaTokenSource
{
  private readonly reader: DrizzleWsaaTokenReader<TQueryResult>;
  private readonly clock: { now: () => Date };
  private readonly service: string;
  private readonly certificateFingerprint: string;

  constructor(
    db: PgDatabase<TQueryResult>,
    clock: { now: () => Date },
    service: string,
    certificateFingerprint: string,
  ) {
    this.reader = new DrizzleWsaaTokenReader(db);
    this.clock = clock;
    this.service = service;
    this.certificateFingerprint = certificateFingerprint;
  }

  async validToken(): Promise<WsaaToken | null> {
    const token = await this.reader.currentWsaaToken(this.service, this.certificateFingerprint);
    return token !== null && isWsaaTokenValid(token, this.clock.now()) ? token : null;
  }
}
