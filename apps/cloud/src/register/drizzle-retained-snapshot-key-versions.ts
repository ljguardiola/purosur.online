import { isRetainedSnapshotGeneration } from "@purosur/domain";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerSnapshotGenerations } from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

export async function retainedSnapshotKeyVersions<TQueryResult extends PgQueryResultHKT>(
  tx: Transaction<TQueryResult>,
  registerId: string,
): Promise<number[]> {
  const kinds = await tx
    .selectDistinct({
      keyVersion: registerSnapshotGenerations.keyVersion,
      status: registerSnapshotGenerations.status,
      pruned: registerSnapshotGenerations.pruned,
    })
    .from(registerSnapshotGenerations)
    .where(eq(registerSnapshotGenerations.registerId, registerId));
  return [...new Set(kinds.filter(isRetainedSnapshotGeneration).map((kind) => kind.keyVersion))];
}
