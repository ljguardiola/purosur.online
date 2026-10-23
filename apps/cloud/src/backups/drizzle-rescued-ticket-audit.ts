import type {
  RescuedTicketAudit,
  RescuedTicketAuditEntry,
} from "@purosur/domain/backups/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog } from "../platform/db/schema.js";

export class DrizzleRescuedTicketAudit<TQueryResult extends PgQueryResultHKT>
  implements RescuedTicketAudit
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  async recordRescue(entry: RescuedTicketAuditEntry): Promise<void> {
    await this.db.insert(auditLog).values({
      entity: "contingency_backup_ticket_rescue",
      entityId: entry.registerId,
      actorId: entry.actorId,
      previousValue: null,
      newValue: { received: entry.received, already_received: entry.alreadyReceived },
      at: this.now(),
    });
  }
}
