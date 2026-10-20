import type { FiscalOnlineSignalEvidence } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

interface HealthCheckRow {
  checked_at: string;
  token_valid: number;
  arca_reachable: number;
}

export function readFiscalOnlineEvidence(database: LocalDatabase): FiscalOnlineSignalEvidence {
  const latest = database
    .prepare<[], HealthCheckRow>(
      `SELECT checked_at, token_valid, arca_reachable
       FROM register_health_checks ORDER BY id DESC LIMIT 1`,
    )
    .get();
  return latest === undefined
    ? { lastHealthCheckOkAt: null, tokenValid: false, arcaReachable: false }
    : {
        lastHealthCheckOkAt: new Date(latest.checked_at),
        tokenValid: latest.token_valid === 1,
        arcaReachable: latest.arca_reachable === 1,
      };
}
