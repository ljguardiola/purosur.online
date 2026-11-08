import type {
  SettlementReportLanes,
  SettlementReportStore,
} from "@purosur/domain/payments/use-cases";
import { sql } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { DrizzleSettlementReportStore } from "./drizzle-settlement-report-store.js";

const SETTLEMENT_REPORT_LOCK_KEY = "mercado_pago_settlement_report";

export class DrizzleSettlementReportLanes<TQueryResult extends PgQueryResultHKT>
  implements SettlementReportLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;

  constructor(connections: DedicatedConnections<TQueryResult>) {
    this.connections = connections;
  }

  inSettlementReportLane<TOutcome>(
    work: (store: SettlementReportStore) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.connections.withConnection(async (db) => {
      const key = sql`hashtextextended(${SETTLEMENT_REPORT_LOCK_KEY}, 0)`;
      await db.execute(sql`select pg_advisory_lock(${key})`);
      try {
        return await work(new DrizzleSettlementReportStore(db));
      } finally {
        await db.execute(sql`select pg_advisory_unlock(${key})`);
      }
    });
  }
}
