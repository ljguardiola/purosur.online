import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LocalDatabaseHealth } from "@purosur/domain/register/use-cases";
import { isDatabaseDamage } from "../platform/database-damage";
import type { LocalDatabase } from "../platform/local-database";

export const DAMAGE_MARKER_FILE = "local-database-damaged";

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

export function localDatabaseHealth(deps: {
  markerPath: string;
  now: () => Date;
  integrityHolds: () => boolean;
}): LocalDatabaseHealth {
  return {
    damageRecorded: async () => existsSync(deps.markerPath),
    integrityHolds: async () => deps.integrityHolds(),
    recordDamage: async () => {
      mkdirSync(dirname(deps.markerPath), { recursive: true });
      writeFileSync(deps.markerPath, deps.now().toISOString());
    },
  };
}
