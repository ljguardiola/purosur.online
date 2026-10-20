import type {
  BranchOfflinePointOfSale,
  BranchOfflinePointOfSaleReader,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  offlinePointOfSaleRetirements,
  pointOfSaleClaims,
  registerOfflinePointsOfSale,
  registers,
} from "../platform/db/schema.js";

export class DrizzleBranchOfflinePointOfSaleReader<TQueryResult extends PgQueryResultHKT>
  implements BranchOfflinePointOfSaleReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async listBranchOfflinePointsOfSale(locationId: string): Promise<BranchOfflinePointOfSale[]> {
    const rows = await this.db
      .select({
        pointOfSaleNumber: pointOfSaleClaims.pointOfSaleNumber,
        registerId: registers.id,
        registerName: registers.name,
        assignedTo: registerOfflinePointsOfSale.registerId,
        retiredAt: offlinePointOfSaleRetirements.retiredAt,
      })
      .from(pointOfSaleClaims)
      .innerJoin(registers, eq(registers.id, pointOfSaleClaims.registerId))
      .leftJoin(
        registerOfflinePointsOfSale,
        eq(registerOfflinePointsOfSale.pointOfSaleNumber, pointOfSaleClaims.pointOfSaleNumber),
      )
      .leftJoin(
        offlinePointOfSaleRetirements,
        eq(offlinePointOfSaleRetirements.pointOfSaleNumber, pointOfSaleClaims.pointOfSaleNumber),
      )
      .where(and(eq(pointOfSaleClaims.mechanism, "offline"), eq(registers.locationId, locationId)))
      .orderBy(asc(pointOfSaleClaims.pointOfSaleNumber));
    return rows.map(({ assignedTo, ...row }) => ({ ...row, assigned: assignedTo !== null }));
  }
}
