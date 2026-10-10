import { registerHoldsOfflineAuthorizationCode } from "@purosur/domain";
import type {
  OfflineAuthorizationCodeHoldingReader,
  RegisterOfflineAuthorizationCodeHolding,
} from "@purosur/domain/alerts/use-cases";
import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import { and, eq, inArray, isNull, min } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  alerts,
  caeaCodes,
  changes,
  deviceState,
  registerInstallations,
  registerOfflinePointsOfSale,
} from "../platform/db/schema.js";
import { openAlertCondition } from "./open-alert-condition.js";

export class DrizzleOfflineAuthorizationCodeHoldingReader<TQueryResult extends PgQueryResultHKT>
  implements OfflineAuthorizationCodeHoldingReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async watchedRegisterHoldings(
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
        lastPullSince: deviceState.lastPullSince,
      })
      .from(registerInstallations)
      .innerJoin(
        registerOfflinePointsOfSale,
        eq(registerOfflinePointsOfSale.registerId, registerInstallations.registerId),
      )
      .leftJoin(deviceState, eq(deviceState.deviceId, registerInstallations.id))
      .where(isNull(registerInstallations.revokedAt));
    return installations.map(({ registerId, deviceId, lastPullSince }) => ({
      registerId,
      deviceId,
      heldFortnightStarts: codes
        .filter(({ changeSeq }) =>
          registerHoldsOfflineAuthorizationCode({ lastPullSince, codeChangeSeq: changeSeq }),
        )
        .map(({ fortnightStart }) => fortnightStart),
    }));
  }

  async scopesOfOpenMissingCodeAlerts(): Promise<string[]> {
    const rows = await this.db
      .select({ scope: alerts.scope })
      .from(alerts)
      .where(and(eq(alerts.kind, "offline_authorization_code_missing"), openAlertCondition()));
    return rows.map(({ scope }) => scope);
  }
}
