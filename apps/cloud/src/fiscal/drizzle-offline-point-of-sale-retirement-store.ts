import type {
  PointOfSaleHolder,
  RetireOfflinePointOfSaleRecord,
  RetireOfflinePointOfSaleStore,
  RetireOfflinePointOfSaleStoreTransaction,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  offlinePointOfSaleRetirements,
  pointOfSaleClaims,
  registerOfflinePointsOfSale,
  registers,
} from "../platform/db/schema.js";
import { holderOf, lockPointOfSale } from "./drizzle-point-of-sale-claims.js";

class DrizzleOfflinePointOfSaleRetirementTransaction<TQueryResult extends PgQueryResultHKT>
  implements RetireOfflinePointOfSaleStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  lockPointOfSale(pointOfSaleNumber: number): Promise<void> {
    return lockPointOfSale(this.tx, pointOfSaleNumber);
  }

  async offlineRegisterOf(pointOfSaleNumber: number): Promise<string | null> {
    const [holder] = await this.tx
      .select({ registerId: registerOfflinePointsOfSale.registerId })
      .from(registerOfflinePointsOfSale)
      .where(eq(registerOfflinePointsOfSale.pointOfSaleNumber, pointOfSaleNumber));
    return holder?.registerId ?? null;
  }

  async branchPointOfSaleClaim(
    locationId: string,
    pointOfSaleNumber: number,
  ): Promise<PointOfSaleHolder | undefined> {
    const [claim] = await this.tx
      .select({
        registerId: pointOfSaleClaims.registerId,
        mechanism: pointOfSaleClaims.mechanism,
        retiredAt: offlinePointOfSaleRetirements.retiredAt,
      })
      .from(pointOfSaleClaims)
      .innerJoin(registers, eq(registers.id, pointOfSaleClaims.registerId))
      .leftJoin(
        offlinePointOfSaleRetirements,
        eq(offlinePointOfSaleRetirements.pointOfSaleNumber, pointOfSaleClaims.pointOfSaleNumber),
      )
      .where(
        and(
          eq(pointOfSaleClaims.pointOfSaleNumber, pointOfSaleNumber),
          eq(registers.locationId, locationId),
        ),
      );
    return claim && holderOf(claim);
  }

  async retirePointOfSale(record: RetireOfflinePointOfSaleRecord): Promise<void> {
    const { pointOfSaleNumber, retiredAt, actorId } = record;
    const [claim] = await this.tx
      .select({ registerId: pointOfSaleClaims.registerId })
      .from(pointOfSaleClaims)
      .where(eq(pointOfSaleClaims.pointOfSaleNumber, pointOfSaleNumber));
    if (!claim) {
      throw new Error("an offline point of sale to retire has no claim");
    }
    await this.tx
      .insert(offlinePointOfSaleRetirements)
      .values({ pointOfSaleNumber, retiredAt, retiredBy: actorId });
    await this.tx.insert(auditLog).values({
      entity: "offline_point_of_sale",
      entityId: claim.registerId,
      actorId,
      previousValue: null,
      newValue: { point_of_sale_number: pointOfSaleNumber, retired_at: retiredAt.toISOString() },
      at: retiredAt,
    });
  }
}

export class DrizzleOfflinePointOfSaleRetirementStore<TQueryResult extends PgQueryResultHKT>
  implements RetireOfflinePointOfSaleStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: RetireOfflinePointOfSaleStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleOfflinePointOfSaleRetirementTransaction(tx)),
    );
  }
}
