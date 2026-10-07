import { type ArcaOnlineStatus, readArcaOnlineStatus } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleArcaReachabilityReader } from "./drizzle-arca-reachability-reader.js";
import { DrizzleWsaaTokenReader } from "./drizzle-wsaa-token-reader.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export interface ArcaOnlineStatusOptions {
  certificateFingerprint: string;
  now: () => Date;
}

export function arcaOnlineStatusOf<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { certificateFingerprint, now }: ArcaOnlineStatusOptions,
): () => Promise<ArcaOnlineStatus> {
  return () =>
    readArcaOnlineStatus(
      {
        reachability: new DrizzleArcaReachabilityReader(db),
        tokens: new DrizzleWsaaTokenReader(db),
        clock: { now },
      },
      { service: WSFE_SERVICE, certificateFingerprint },
    );
}
