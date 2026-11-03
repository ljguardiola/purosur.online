import type {
  PurchaseChangeListing,
  PurchaseChangeReader,
} from "@purosur/domain/purchasing/use-cases";
import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, purchases, users } from "../platform/db/schema.js";
import { changeOfAuditValues, PURCHASE_AUDIT_ENTITY } from "./purchase-audit-values.js";

export class DrizzlePurchaseChangeReader<TQueryResult extends PgQueryResultHKT>
  implements PurchaseChangeReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async purchaseChanges(
    locationId: string,
    purchaseId: string,
  ): Promise<PurchaseChangeListing[] | undefined> {
    const [purchase] = await this.db
      .select({ id: purchases.id })
      .from(purchases)
      .where(and(eq(purchases.id, purchaseId), eq(purchases.locationId, locationId)));
    if (!purchase) {
      return undefined;
    }
    const rows = await this.db
      .select({
        id: auditLog.id,
        actorId: auditLog.actorId,
        actorName: users.firstName,
        correctedAt: auditLog.at,
        previousValue: auditLog.previousValue,
        newValue: auditLog.newValue,
      })
      .from(auditLog)
      .innerJoin(users, eq(users.id, auditLog.actorId))
      .where(and(eq(auditLog.entity, PURCHASE_AUDIT_ENTITY), eq(auditLog.entityId, purchaseId)))
      .orderBy(desc(auditLog.at), desc(auditLog.id));
    return rows.map(({ previousValue, newValue, actorId, ...row }) => ({
      ...row,
      actorId: actorId as string,
      change: changeOfAuditValues(previousValue, newValue),
    }));
  }
}
