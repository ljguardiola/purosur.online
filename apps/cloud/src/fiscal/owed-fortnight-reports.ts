import { fortnightClosesAt } from "@purosur/domain";
import type {
  OwedFortnightReport,
  RecordedFortnightReport,
} from "@purosur/domain/fiscal/use-cases";
import { eq, lt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { caeaCodes, fortnightReports, pointOfSaleClaims } from "../platform/db/schema.js";

export interface OwedFortnightReportWithState {
  owed: OwedFortnightReport;
  state: RecordedFortnightReport["state"] | null;
}

export async function owedFortnightReportsWithState<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  today: string,
): Promise<OwedFortnightReportWithState[]> {
  const codes = await db.select().from(caeaCodes).where(lt(caeaCodes.fortnightEnd, today));
  const claims = await db
    .select({
      pointOfSaleNumber: pointOfSaleClaims.pointOfSaleNumber,
      registerId: pointOfSaleClaims.registerId,
      claimedAt: pointOfSaleClaims.claimedAt,
    })
    .from(pointOfSaleClaims)
    .where(eq(pointOfSaleClaims.mechanism, "offline"));
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
    const closesAt = fortnightClosesAt(fortnight);
    return claims
      .filter(({ claimedAt }) => claimedAt < closesAt)
      .map(({ pointOfSaleNumber, registerId }) => ({
        owed: {
          pointOfSaleNumber,
          registerId,
          code: { code: code.code, fortnight, reportDeadline: code.reportDeadline },
        },
        state: stateOf.get(`${pointOfSaleNumber}:${fortnight.start}`) ?? null,
      }))
      .filter(({ state }) => state !== "accepted");
  });
}
