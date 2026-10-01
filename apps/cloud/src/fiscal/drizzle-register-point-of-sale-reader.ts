import type {
  BranchRegisterPointOfSale,
  RegisterPointOfSaleReader,
} from "@purosur/domain/fiscal/use-cases";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerPointsOfSale, registers } from "../platform/db/schema.js";

const NEVER_CONFIGURED = 0;

export class DrizzleRegisterPointOfSaleReader<TQueryResult extends PgQueryResultHKT>
  implements RegisterPointOfSaleReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async listBranchRegisterPointsOfSale(locationId: string): Promise<BranchRegisterPointOfSale[]> {
    const rows = await this.db
      .select({
        registerId: registers.id,
        registerName: registers.name,
        pointOfSaleNumber: registerPointsOfSale.pointOfSaleNumber,
        fiscalAddressId: registerPointsOfSale.fiscalAddressId,
        version: registerPointsOfSale.version,
      })
      .from(registers)
      .leftJoin(registerPointsOfSale, eq(registerPointsOfSale.registerId, registers.id))
      .where(eq(registers.locationId, locationId))
      .orderBy(asc(registers.name));
    return rows.map(({ version, ...row }) => ({ ...row, version: version ?? NEVER_CONFIGURED }));
  }
}
