import type { IdGenerator } from "@purosur/domain/register/use-cases";
import type {
  RegisterPredecessor,
  RegisterReplenishmentStore,
  RegisterReplenishmentTransaction,
  ReplenishedEventApplication,
  ReplenishedEventSource,
  SyncedFact,
} from "@purosur/domain/sync/use-cases";
import { applyReplenishedClockCorrection } from "../fiscal/replenished-clock-corrections";
import type { LocalDatabase } from "../platform/local-database";
import { applyReplenishedCashFact } from "../register/replenished-cash-facts";
import { applyReplenishedSaleFact } from "../sales/replenished-sale-facts";
import { applyReplenishedOpeningCountFact } from "../stock/replenished-opening-count-facts";
import { prepareAccessPageWrites } from "./access-page-writes";

export interface SqliteRegisterReplenishmentStoreDeps {
  database: LocalDatabase;
  pepper: string;
  ids: IdGenerator;
}

export class SqliteRegisterReplenishmentStore implements RegisterReplenishmentStore {
  private readonly database: LocalDatabase;
  private readonly pepper: string;
  private readonly ids: IdGenerator;

  constructor({ database, pepper, ids }: SqliteRegisterReplenishmentStoreDeps) {
    this.database = database;
    this.pepper = pepper;
    this.ids = ids;
  }

  async predecessor(): Promise<RegisterPredecessor | undefined> {
    const row = this.database
      .prepare<[], { device_id: string; last_acknowledged_seq: number }>(
        "SELECT device_id, last_acknowledged_seq FROM register_predecessor",
      )
      .get();
    return row && { deviceId: row.device_id, lastAcknowledgedSeq: row.last_acknowledged_seq };
  }

  async transaction<TOutcome>(
    work: (tx: RegisterReplenishmentTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const outcome = await work(this.scope());
      this.database.exec("COMMIT");
      return outcome;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async finish(): Promise<void> {
    this.database.exec("DELETE FROM register_predecessor");
  }

  private scope(): RegisterReplenishmentTransaction {
    const { database, pepper, ids } = this;
    return {
      async applyUsers(users) {
        const access = prepareAccessPageWrites(database, pepper, "redelivery");
        for (const user of users) {
          access.user({
            entity_id: user.userId,
            row: {
              first_name: user.firstName,
              role_id: user.roleId,
              salt: user.salt,
              pin_hash: user.pinHash,
              active: user.active,
              version: user.version,
            },
          });
        }
      },
      async eventApplied(eventId) {
        return (
          database.prepare("SELECT 1 FROM replenished_events WHERE event_id = ?").get(eventId) !==
          undefined
        );
      },
      async applyFact(fact, source) {
        return applyFact(database, ids, fact, source);
      },
      async recordEventApplied(eventId) {
        database.prepare("INSERT INTO replenished_events (event_id) VALUES (?)").run(eventId);
      },
    };
  }
}

function applyFact(
  database: LocalDatabase,
  ids: IdGenerator,
  fact: SyncedFact,
  source: ReplenishedEventSource,
): ReplenishedEventApplication {
  switch (fact.kind) {
    case "cash_session_opened":
    case "cash_session_closed":
    case "cash_movement_recorded":
      applyReplenishedCashFact(database, fact, source, ids);
      return "applied";
    case "sale_completed":
    case "sale_cancelled":
    case "qr_payment_replaced":
      applyReplenishedSaleFact(database, fact, source);
      return "applied";
    case "opening_count_recorded":
    case "opening_count_withdrawn":
      applyReplenishedOpeningCountFact(database, fact);
      return "applied";
    case "clock_corrected":
      applyReplenishedClockCorrection(database, fact);
      return "applied";
    case "sale_voided":
    case "sale_print_state_changed":
    case "reprint_recorded":
    case "fiscal_gate_failed":
    case "offline_fiscal_document_issued":
      return "not_yet_applicable";
  }
}
