import type { LocalDatabase } from "../../platform/local-database";
import { LOCAL_MIGRATIONS } from "../../platform/local-migrations";
import { migrationClock } from "../../platform/test-support/migration-clock";
import { openLocalDatabase } from "../../platform/test-support/open-local-database";
import type { RegisterPulledChange } from "../pulled-change";
import { SqliteLocalReplica } from "../sqlite-local-replica";

export const TEST_PEPPER = Buffer.alloc(32, 7).toString("base64url");

export interface AdoptedReplica {
  database: LocalDatabase;
  replica: SqliteLocalReplica;
}

export function openAdoptedReplica(): AdoptedReplica {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  const replica = new SqliteLocalReplica(database);
  replica.adoptDevice({ deviceId: "device-a", pepper: TEST_PEPPER });
  return { database, replica };
}

export async function savePulledChanges(
  replica: SqliteLocalReplica,
  ...changes: RegisterPulledChange[]
): Promise<void> {
  const cursor = changes.at(-1)?.changeSeq ?? 0;
  await replica.savePage({ changes, cursor, hasMore: false });
}
