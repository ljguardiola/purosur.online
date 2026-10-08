import type {
  BranchRegisterLastSync,
  BranchRegisterSyncReader,
} from "@purosur/domain/register/use-cases";
import { asc, eq, max } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deviceState, registerInstallations, registers } from "../platform/db/schema.js";

export class DrizzleBranchRegisterSyncReader<TQueryResult extends PgQueryResultHKT>
  implements BranchRegisterSyncReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  // The latest accepted push among every installation the register has had, the revoked ones
  // included: a replaced installation's sync was still the register's.
  async lastSuccessfulSyncOfBranchRegisters(locationId: string): Promise<BranchRegisterLastSync[]> {
    const rows = await this.db
      .select({
        id: registers.id,
        name: registers.name,
        lastSuccessfulSyncAt: max(deviceState.lastAcceptedPushAt),
      })
      .from(registers)
      .leftJoin(registerInstallations, eq(registerInstallations.registerId, registers.id))
      .leftJoin(deviceState, eq(deviceState.deviceId, registerInstallations.id))
      .where(eq(registers.locationId, locationId))
      .groupBy(registers.id, registers.name)
      .orderBy(asc(registers.name));
    return rows;
  }
}
