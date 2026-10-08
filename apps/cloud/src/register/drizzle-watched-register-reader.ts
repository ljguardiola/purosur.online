import { isWatchedForQuietness, type WatchedRegister } from "@purosur/domain";
import type { WatchedRegisterReader } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deviceState, registerInstallations, registers } from "../platform/db/schema.js";

export class DrizzleWatchedRegisterReader<TQueryResult extends PgQueryResultHKT>
  implements WatchedRegisterReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  // A register's last successful sync is the latest accepted push among every installation it
  // has had, the revoked ones included: a replaced installation's sync was still the register's.
  async watchedRegisters(): Promise<WatchedRegister[]> {
    const installations = await this.db
      .select({
        registerId: registers.id,
        deviceId: registerInstallations.id,
        locationId: registers.locationId,
        revokedAt: registerInstallations.revokedAt,
        lastAcceptedPushAt: deviceState.lastAcceptedPushAt,
        reportsEveryCycleSince: deviceState.reportsEveryCycleSince,
      })
      .from(registerInstallations)
      .innerJoin(registers, eq(registers.id, registerInstallations.registerId))
      .leftJoin(deviceState, eq(deviceState.deviceId, registerInstallations.id));
    const lastSyncOfRegister = new Map<string, Date>();
    for (const { registerId, lastAcceptedPushAt } of installations) {
      const latest = lastSyncOfRegister.get(registerId);
      if (lastAcceptedPushAt !== null && (latest === undefined || lastAcceptedPushAt > latest)) {
        lastSyncOfRegister.set(registerId, lastAcceptedPushAt);
      }
    }
    return installations
      .filter(isWatchedForQuietness)
      .map(({ registerId, deviceId, locationId, reportsEveryCycleSince }) => ({
        registerId,
        deviceId,
        locationId,
        lastSuccessfulSyncAt: lastSyncOfRegister.get(registerId) ?? reportsEveryCycleSince,
      }));
  }
}
