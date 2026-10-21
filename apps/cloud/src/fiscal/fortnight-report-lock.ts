import type { FortnightReportKey } from "@purosur/domain/fiscal/use-cases";
import { type SQL, sql } from "drizzle-orm";

export function fortnightReportLock({ pointOfSaleNumber, fortnight }: FortnightReportKey): SQL {
  return sql`hashtextextended(${`fortnight_report:${pointOfSaleNumber}:${fortnight.start}`}, 0)`;
}
