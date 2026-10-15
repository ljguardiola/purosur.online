import { isFortnightReportOutstanding, owesFortnightReport } from "@purosur/domain";
import type {
  OwedFortnightReport,
  RecordedFortnightReport,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  caeaCodes,
  fortnightReports,
  pointOfSaleClaims,
  registers,
} from "../platform/db/schema.js";

export interface OwedFortnightReportWithState {
  owed: OwedFortnightReport;
  state: RecordedFortnightReport["state"] | null;
}

export async function owedFortnightReportsWithState<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  today: string,
): Promise<OwedFortnightReportWithState[]> {
  const presentations = await closedFortnightPresentations(db, today);
  return presentations.filter(({ state }) => isFortnightReportOutstanding(state));
}

export async function fortnightReportsOwedAs<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  presentations: { pointOfSaleNumber: number; fortnightStart: string }[],
): Promise<OwedFortnightReport[]> {
  const starts = new Set(presentations.map(({ fortnightStart }) => fortnightStart));
  const wanted = new Set(
    presentations.map(
      ({ pointOfSaleNumber, fortnightStart }) => `${pointOfSaleNumber}:${fortnightStart}`,
    ),
  );
  const codes = (await db.select().from(caeaCodes)).filter(({ fortnightStart }) =>
    starts.has(fortnightStart),
  );
  const claims = await db
    .select({
      pointOfSaleNumber: pointOfSaleClaims.pointOfSaleNumber,
      registerId: pointOfSaleClaims.registerId,
    })
    .from(pointOfSaleClaims)
    .where(eq(pointOfSaleClaims.mechanism, "offline"));
  return codes.flatMap((code) =>
    claims
      .filter(({ pointOfSaleNumber }) => wanted.has(`${pointOfSaleNumber}:${code.fortnightStart}`))
      .map(({ pointOfSaleNumber, registerId }) => ({
        pointOfSaleNumber,
        registerId,
        code: {
          code: code.code,
          fortnight: { start: code.fortnightStart, end: code.fortnightEnd },
          reportDeadline: code.reportDeadline,
        },
      })),
  );
}

export async function closedFortnightPresentations<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  today: string,
  locationId?: string,
): Promise<OwedFortnightReportWithState[]> {
  const codes = await db.select().from(caeaCodes);
  const claims = await db
    .select({
      pointOfSaleNumber: pointOfSaleClaims.pointOfSaleNumber,
      registerId: pointOfSaleClaims.registerId,
      claimedAt: pointOfSaleClaims.claimedAt,
    })
    .from(pointOfSaleClaims)
    .innerJoin(registers, eq(registers.id, pointOfSaleClaims.registerId))
    .where(
      and(
        eq(pointOfSaleClaims.mechanism, "offline"),
        locationId === undefined ? undefined : eq(registers.locationId, locationId),
      ),
    );
  const recorded = await db
    .select({
      pointOfSaleNumber: fortnightReports.pointOfSaleNumber,
      fortnightStart: fortnightReports.fortnightStart,
      state: fortnightReports.state,
    })
    .from(fortnightReports);
  const stateOf = new Map(
    recorded.map(({ pointOfSaleNumber, fortnightStart, state }) => [
      `${pointOfSaleNumber}:${fortnightStart}`,
      state,
    ]),
  );

  return codes.flatMap((code) => {
    const fortnight = { start: code.fortnightStart, end: code.fortnightEnd };
    return claims
      .filter(({ claimedAt }) => owesFortnightReport({ fortnight, claimedAt }, today))
      .map(({ pointOfSaleNumber, registerId }) => ({
        owed: {
          pointOfSaleNumber,
          registerId,
          code: { code: code.code, fortnight, reportDeadline: code.reportDeadline },
        },
        state: stateOf.get(`${pointOfSaleNumber}:${fortnight.start}`) ?? null,
      }));
  });
}
