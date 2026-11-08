import {
  compareCodeUnits,
  compareSpanishText,
  lastSuccessfulSyncOfRegister,
} from "@purosur/domain";
import type {
  BranchRegisterLastSync,
  BranchRegisterSyncReader,
} from "@purosur/domain/installation/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deviceState, registerInstallations, registers } from "../platform/db/schema.js";

export class DrizzleBranchRegisterSyncReader<TQueryResult extends PgQueryResultHKT>
  implements BranchRegisterSyncReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async lastSuccessfulSyncOfBranchRegisters(locationId: string): Promise<BranchRegisterLastSync[]> {
    const installations = await this.db
      .select({
        id: registers.id,
        name: registers.name,
        lastAcceptedPushAt: deviceState.lastAcceptedPushAt,
      })
      .from(registers)
      .leftJoin(registerInstallations, eq(registerInstallations.registerId, registers.id))
      .leftJoin(deviceState, eq(deviceState.deviceId, registerInstallations.id))
      .where(eq(registers.locationId, locationId));
    installations.sort(
      (a, b) => compareSpanishText(a.name, b.name) || compareCodeUnits(a.id, b.id),
    );
    const registerNames = new Map(installations.map(({ id, name }) => [id, name]));
    return [...registerNames].map(([id, name]) => ({
      id,
      name,
      lastSuccessfulSyncAt: lastSuccessfulSyncOfRegister(
        installations.filter((installation) => installation.id === id),
      ),
    }));
  }
}
