import { localDatabaseVersionOf } from "../model/local-database-version.js";
import type { RegisterService } from "../model/register-service.js";
import type { LocalDatabaseHealthPorts } from "./local-database-health.js";
import type { LocalDatabaseMigrations } from "./local-database-migrations.js";

export interface CheckLocalDatabasePorts extends LocalDatabaseHealthPorts {
  migrations: LocalDatabaseMigrations;
}

export type LocalDatabaseCheck = RegisterService | { kind: "newer_than_version" };

export async function checkLocalDatabase({
  health,
  migrations,
}: CheckLocalDatabasePorts): Promise<LocalDatabaseCheck> {
  const version = localDatabaseVersionOf({
    applied: await migrations.appliedMigrationNames(),
    known: migrations.knownMigrationNames(),
  });
  if (version === "newer_than_version") {
    return { kind: "newer_than_version" };
  }
  if (await health.damageRecorded()) {
    return { kind: "out_of_service" };
  }
  if (await health.integrityHolds()) {
    return { kind: "in_service" };
  }
  await health.recordDamage();
  return { kind: "out_of_service" };
}
