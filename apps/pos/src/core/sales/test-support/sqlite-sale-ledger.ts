import type { LocalDatabase } from "../../platform/local-database";
import { LOCAL_MIGRATIONS } from "../../platform/local-migrations";
import { migrationClock } from "../../platform/test-support/migration-clock";
import { openLocalDatabase } from "../../platform/test-support/open-local-database";
import { SqliteSaleLedger } from "../sqlite-sale-ledger";

export interface LedgerWithOpenSale {
  database: LocalDatabase;
  ledger: SqliteSaleLedger;
}

export function ledgerWithOpenSale(): LedgerWithOpenSale {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-10-09T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
     VALUES ('sale-1', 'register-1', 'device-1', 'session-1', 'u1', 'OPEN', NULL);`,
  );
  return { database, ledger: new SqliteSaleLedger(database, { activePerson: () => undefined }) };
}
