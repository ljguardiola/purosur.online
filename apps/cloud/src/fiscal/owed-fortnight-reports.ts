import { isFortnightPresentationOwed, owesFortnightReport } from "@purosur/domain";
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
  taxAuthorityOwedPresentations,
} from "../platform/db/schema.js";

export interface OwedFortnightReportWithState {
  owed: OwedFortnightReport;
  state: RecordedFortnightReport["state"] | null;
  movement: RecordedFortnightReport["movement"];
  listed: boolean;
}

export async function owedFortnightReportsWithState<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  today: string,
): Promise<OwedFortnightReportWithState[]> {
  const presentations = await closedFortnightPresentations(db, today);
  return presentations.filter(isFortnightPresentationOwed);
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
      movement: fortnightReports.movement,
    })
    .from(fortnightReports);
  const listed = new Set(
    (
      await db
        .select({
          pointOfSaleNumber: taxAuthorityOwedPresentations.pointOfSaleNumber,
          fortnightStart: taxAuthorityOwedPresentations.fortnightStart,
        })
        .from(taxAuthorityOwedPresentations)
    ).map(({ pointOfSaleNumber, fortnightStart }) => `${pointOfSaleNumber}:${fortnightStart}`),
  );
  const recordOf = new Map(
    recorded.map(({ pointOfSaleNumber, fortnightStart, state, movement }) => [
      `${pointOfSaleNumber}:${fortnightStart}`,
      { state, movement },
    ]),
  );

  return codes.flatMap((code) => {
    const fortnight = { start: code.fortnightStart, end: code.fortnightEnd };
    return claims
      .map((claim) => ({
        ...claim,
        listed: listed.has(`${claim.pointOfSaleNumber}:${fortnight.start}`),
      }))
      .filter(({ claimedAt, listed: isListed }) =>
        owesFortnightReport({ fortnight, claimedAt, listed: isListed }, today),
      )
      .map(({ pointOfSaleNumber, registerId, listed: isListed }) => {
        const report = recordOf.get(`${pointOfSaleNumber}:${fortnight.start}`);
        return {
          owed: {
            pointOfSaleNumber,
            registerId,
            code: { code: code.code, fortnight, reportDeadline: code.reportDeadline },
          },
          state: report?.state ?? null,
          movement: report?.movement ?? null,
          listed: isListed,
        };
      });
  });
}
