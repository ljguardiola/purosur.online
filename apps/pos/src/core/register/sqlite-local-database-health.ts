import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LocalDatabaseHealth } from "@purosur/domain/register/use-cases";
import { isDatabaseDamage } from "../platform/database-damage";
import type { LocalDatabase } from "../platform/local-database";

const DAMAGE_MARKER_FILE = "local-database-damaged";

interface IntegrityRow {
  integrity_check: string;
}

export function sqliteIntegrityHolds(database: Pick<LocalDatabase, "pragma">): boolean {
  try {
    const integrity = database.pragma("integrity_check") as IntegrityRow[];
    const intact = integrity.length === 1 && integrity[0]?.integrity_check === "ok";
    return intact && (database.pragma("foreign_key_check") as unknown[]).length === 0;
  } catch (error) {
    if (isDatabaseDamage(error)) {
      return false;
    }
    throw error;
  }
}

export function localDatabaseDamageIn(folder: string | undefined): () => boolean {
  return () => folder !== undefined && existsSync(join(folder, DAMAGE_MARKER_FILE));
}

export function localDatabaseHealth(deps: {
  folder: string;
  now: () => Date;
  integrityHolds: () => boolean;
}): LocalDatabaseHealth {
  const damaged = localDatabaseDamageIn(deps.folder);
  return {
    damageRecorded: async () => damaged(),
    integrityHolds: async () => deps.integrityHolds(),
    recordDamage: async () => {
      mkdirSync(deps.folder, { recursive: true });
      writeFileSync(join(deps.folder, DAMAGE_MARKER_FILE), deps.now().toISOString());
    },
  };
}
