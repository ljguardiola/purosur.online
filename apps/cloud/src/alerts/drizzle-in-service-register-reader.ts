import type { InServiceRegister, InServiceRegisterReader } from "@purosur/domain/alerts/use-cases";
import { eq, inArray, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  branchHours,
  deviceState,
  registerInstallations,
  registers,
} from "../platform/db/schema.js";

// Postgres' `time` type answers with seconds ("09:00:00"); branch hours are only ever HH:MM.
function hoursMinutes(time: string): string {
  return time.slice(0, 5);
}

export class DrizzleInServiceRegisterReader<TQueryResult extends PgQueryResultHKT>
  implements InServiceRegisterReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async inServiceRegisters(): Promise<InServiceRegister[]> {
    const installations = await this.db
      .select({
        registerId: registers.id,
        deviceId: registerInstallations.id,
        locationId: registers.locationId,
        enrolledAt: registerInstallations.enrolledAt,
        lastAcceptedPushAt: deviceState.lastAcceptedPushAt,
      })
      .from(registerInstallations)
      .innerJoin(registers, eq(registers.id, registerInstallations.registerId))
      .leftJoin(deviceState, eq(deviceState.deviceId, registerInstallations.id))
      .where(isNull(registerInstallations.revokedAt));
    if (installations.length === 0) {
      return [];
    }
    const hours = await this.db
      .select({
        locationId: branchHours.locationId,
        dayOfWeek: branchHours.dayOfWeek,
        opensAt: branchHours.opensAt,
        closesAt: branchHours.closesAt,
      })
      .from(branchHours)
      .where(
        inArray(
          branchHours.locationId,
          installations.map((installation) => installation.locationId),
        ),
      );
    return installations.map((installation) => ({
      ...installation,
      hours: hours
        .filter((range) => range.locationId === installation.locationId)
        .map(({ dayOfWeek, opensAt, closesAt }) => ({
          dayOfWeek,
          opensAt: hoursMinutes(opensAt),
          closesAt: hoursMinutes(closesAt),
        })),
    }));
  }
}
