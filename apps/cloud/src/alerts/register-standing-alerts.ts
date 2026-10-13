import {
  registerFiscalEmissionObservation,
  registerSalesDeniedObservation,
  registerSyncedObservation,
  registerVersionObservation,
} from "@purosur/domain";
import type { RegisterStops, RegisterVersionStanding } from "@purosur/domain/sync/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { observeAlertCondition } from "./observe-alert-condition.js";

export async function observeRegisterSynced<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  registerId: string,
  at: Date,
): Promise<void> {
  await observeAlertCondition(tx, registerSyncedObservation(registerId), { now: () => at });
}

export async function observeRegisterVersionStanding<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  standing: RegisterVersionStanding,
  at: Date,
): Promise<void> {
  await observeAlertCondition(tx, registerVersionObservation(standing), { now: () => at });
}

export async function observeRegisterStops<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  stops: RegisterStops,
  at: Date,
): Promise<void> {
  const salesDenied = registerSalesDeniedObservation(stops);
  if (salesDenied !== undefined) {
    await observeAlertCondition(tx, salesDenied, { now: () => at });
  }
  const fiscalEmission = registerFiscalEmissionObservation(stops);
  if (fiscalEmission !== undefined) {
    await observeAlertCondition(tx, fiscalEmission, { now: () => at });
  }
}
