import { FACTURA_C_DOCUMENT_TYPE, OFFLINE_SERIES_DOCUMENT_TYPES } from "@purosur/domain";
import type { RealTimeNumberingLane } from "@purosur/domain/installation/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  registerOfflinePointsOfSale,
  registerPointsOfSale,
  taxAuthorityLastAuthorizedNumbers,
} from "../platform/db/schema.js";
import type { EnqueueTaxAuthorityCount } from "./graphile-tax-authority-count-queue.js";
import { pointOfSaleLaneLockKey } from "./point-of-sale-lane-lock.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

export async function takeRegisterRealTimeNumberingLane<TQueryResult extends PgQueryResultHKT>(
  tx: Transaction<TQueryResult>,
  registerId: string,
): Promise<RealTimeNumberingLane | null> {
  const [realTime] = await tx
    .select({ pointOfSale: registerPointsOfSale.pointOfSaleNumber })
    .from(registerPointsOfSale)
    .where(eq(registerPointsOfSale.registerId, registerId));
  if (realTime === undefined) {
    return null;
  }
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${pointOfSaleLaneLockKey(realTime.pointOfSale)}, 0))`,
  );
  const [held] = await tx
    .select({ lastAuthorized: taxAuthorityLastAuthorizedNumbers.lastAuthorized })
    .from(taxAuthorityLastAuthorizedNumbers)
    .where(
      and(
        eq(taxAuthorityLastAuthorizedNumbers.pointOfSaleNumber, realTime.pointOfSale),
        eq(taxAuthorityLastAuthorizedNumbers.documentType, FACTURA_C_DOCUMENT_TYPE),
      ),
    );
  return { pointOfSale: realTime.pointOfSale, heldCount: held?.lastAuthorized ?? null };
}

export async function requireFreshTaxAuthorityCountOfRegister<
  TQueryResult extends PgQueryResultHKT,
>(
  tx: Transaction<TQueryResult>,
  registerId: string,
  enqueueTaxAuthorityCount: EnqueueTaxAuthorityCount,
): Promise<void> {
  const [realTime] = await tx
    .select({ pointOfSale: registerPointsOfSale.pointOfSaleNumber })
    .from(registerPointsOfSale)
    .where(eq(registerPointsOfSale.registerId, registerId));
  const [offline] = await tx
    .select({ pointOfSale: registerOfflinePointsOfSale.pointOfSaleNumber })
    .from(registerOfflinePointsOfSale)
    .where(eq(registerOfflinePointsOfSale.registerId, registerId));
  if (realTime !== undefined) {
    await enqueueTaxAuthorityCount(tx, realTime.pointOfSale, FACTURA_C_DOCUMENT_TYPE);
  }
  if (offline !== undefined) {
    await tx
      .delete(taxAuthorityLastAuthorizedNumbers)
      .where(eq(taxAuthorityLastAuthorizedNumbers.pointOfSaleNumber, offline.pointOfSale));
    for (const documentType of OFFLINE_SERIES_DOCUMENT_TYPES) {
      await enqueueTaxAuthorityCount(tx, offline.pointOfSale, documentType);
    }
  }
}
