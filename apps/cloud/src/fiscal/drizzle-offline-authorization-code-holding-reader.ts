import { hasPulledChange, mustHoldOfflineAuthorizationCode } from "@purosur/domain";
import type {
  Fortnight,
  OfflineAuthorizationCodeHoldingReader,
  RegisterOfflineAuthorizationCodeHolding,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, inArray, min } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  caeaCodes,
  changes,
  deviceState,
  registerInstallations,
  registerOfflinePointsOfSale,
} from "../platform/db/schema.js";

export class DrizzleOfflineAuthorizationCodeHoldingReader<TQueryResult extends PgQueryResultHKT>
  implements OfflineAuthorizationCodeHoldingReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async registerHoldings(
    fortnights: readonly Fortnight[],
  ): Promise<RegisterOfflineAuthorizationCodeHolding[]> {
    const codes = await this.db
      .select({ fortnightStart: caeaCodes.fortnightStart, changeSeq: min(changes.changeSeq) })
      .from(caeaCodes)
      .innerJoin(
        changes,
        and(
          eq(changes.entity, "offline_authorization_code"),
          eq(changes.entityId, caeaCodes.id),
          eq(changes.op, "insert"),
        ),
      )
      .where(
        inArray(
          caeaCodes.fortnightStart,
          fortnights.map(({ start }) => start),
        ),
      )
      .groupBy(caeaCodes.fortnightStart);
    const installations = await this.db
      .select({
        registerId: registerInstallations.registerId,
        deviceId: registerInstallations.id,
        revokedAt: registerInstallations.revokedAt,
        offlinePointOfSaleNumber: registerOfflinePointsOfSale.pointOfSaleNumber,
        lastPullSince: deviceState.lastPullSince,
      })
      .from(registerInstallations)
      .leftJoin(
        registerOfflinePointsOfSale,
        eq(registerOfflinePointsOfSale.registerId, registerInstallations.registerId),
      )
      .leftJoin(deviceState, eq(deviceState.deviceId, registerInstallations.id));
    return installations
      .filter(mustHoldOfflineAuthorizationCode)
      .map(({ registerId, deviceId, lastPullSince }) => ({
        registerId,
        deviceId,
        heldFortnightStarts: codes
          .filter(({ changeSeq }) => hasPulledChange({ cursor: lastPullSince, changeSeq }))
          .map(({ fortnightStart }) => fortnightStart),
      }));
  }
}
