import {
  type DeferredSaleRegularizationTask,
  EXPIRED_DEFERRED_SALE_STATE,
  FACTURA_C_DOCUMENT_TYPE,
  latestIssuedOn,
  PENDING_DEFERRED_SALE_STATE,
} from "@purosur/domain";
import type {
  DeferredSaleCandidate,
  DeferredSaleExpiryStore,
  DeferredSaleExpiryTransaction,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq, max, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  deferredSales,
  fiscalRequests,
  fiscalTasks,
  registerPointsOfSale,
  taxAuthorityLastAuthorizedNumbers,
} from "../platform/db/schema.js";

class DrizzleDeferredSaleExpiryTransaction<TQueryResult extends PgQueryResultHKT>
  implements DeferredSaleExpiryTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async lockPendingDeferredSales(): Promise<DeferredSaleCandidate[]> {
    const taxAuthorityDay = this.tx
      .select({ day: taxAuthorityLastAuthorizedNumbers.issuedOn })
      .from(taxAuthorityLastAuthorizedNumbers)
      .where(
        and(
          eq(
            taxAuthorityLastAuthorizedNumbers.pointOfSaleNumber,
            registerPointsOfSale.pointOfSaleNumber,
          ),
          eq(taxAuthorityLastAuthorizedNumbers.documentType, FACTURA_C_DOCUMENT_TYPE),
        ),
      );
    const authorizedRequestDay = this.tx
      .select({ day: max(fiscalRequests.issuedOn) })
      .from(fiscalRequests)
      .where(
        and(
          eq(fiscalRequests.pointOfSale, registerPointsOfSale.pointOfSaleNumber),
          eq(fiscalRequests.answerKind, "authorized"),
        ),
      );
    const rows = await this.tx
      .select({
        id: deferredSales.id,
        saleId: deferredSales.saleId,
        registerId: deferredSales.registerId,
        locationId: deferredSales.locationId,
        occurredAt: deferredSales.occurredAt,
        total: deferredSales.total,
        shortCode: deferredSales.shortCode,
        taxAuthorityDay: sql<string | null>`(${taxAuthorityDay})`,
        authorizedRequestDay: sql<string | null>`(${authorizedRequestDay})`,
      })
      .from(deferredSales)
      .leftJoin(registerPointsOfSale, eq(registerPointsOfSale.registerId, deferredSales.registerId))
      .where(eq(deferredSales.state, PENDING_DEFERRED_SALE_STATE))
      .orderBy(asc(deferredSales.occurredAt), asc(deferredSales.id))
      .for("update", { of: deferredSales, skipLocked: true });
    return rows.map(
      ({ taxAuthorityDay: fromTaxAuthority, authorizedRequestDay: fromRequests, ...sale }) => ({
        ...sale,
        lastAuthorizedIssuedOn: latestIssuedOn(fromTaxAuthority, fromRequests),
      }),
    );
  }

  async recordExpiry(deferredSaleId: string, task: DeferredSaleRegularizationTask): Promise<void> {
    await this.tx
      .update(deferredSales)
      .set({ state: EXPIRED_DEFERRED_SALE_STATE, expiredAt: task.createdAt })
      .where(eq(deferredSales.id, deferredSaleId));
    await this.tx.insert(fiscalTasks).values({
      id: crypto.randomUUID(),
      kind: task.kind,
      registerId: task.registerId,
      deferredSaleId: task.deferredSaleId,
      reason: {
        saleOccurredAt: task.saleOccurredAt.toISOString(),
        total: task.total,
        shortCode: task.shortCode,
      },
      state: task.state,
      createdAt: task.createdAt,
    });
  }
}

export class DrizzleDeferredSaleExpiryStore<TQueryResult extends PgQueryResultHKT>
  implements DeferredSaleExpiryStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (transaction: DeferredSaleExpiryTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleDeferredSaleExpiryTransaction(tx)));
  }
}
