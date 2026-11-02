import {
  compareCodeUnits,
  compareSpanishText,
  isLeftBehindByMinimum,
  isOutOfService,
} from "@purosur/domain";
import type {
  InstallationLeftBehind,
  InstallationsLeftBehindReader,
} from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deviceState, registerInstallations, registers } from "../platform/db/schema.js";

export class DrizzleInstallationsLeftBehindReader<TQueryResult extends PgQueryResultHKT>
  implements InstallationsLeftBehindReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async installationsLeftBehindBy(minimum: string): Promise<InstallationLeftBehind[]> {
    const rows = await this.db
      .select({
        installationId: registerInstallations.id,
        registerName: registers.name,
        appVersion: deviceState.appVersion,
        revokedAt: registerInstallations.revokedAt,
      })
      .from(registerInstallations)
      .innerJoin(registers, eq(registers.id, registerInstallations.registerId))
      .leftJoin(deviceState, eq(deviceState.deviceId, registerInstallations.id));
    return rows
      .sort(
        (a, b) =>
          compareSpanishText(a.registerName, b.registerName) ||
          compareCodeUnits(a.installationId, b.installationId),
      )
      .filter((row) => !isOutOfService(row) && isLeftBehindByMinimum(row.appVersion, minimum))
      .map(({ registerName, appVersion }) => ({ registerName, appVersion }));
  }
}
