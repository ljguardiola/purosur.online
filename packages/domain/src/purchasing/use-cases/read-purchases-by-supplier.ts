import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type PurchasesBySupplier,
  purchasesBySupplier,
} from "../model/purchases-by-supplier-report.js";
import type { PurchasesReportReader } from "./purchases-report-reader.js";

export interface ReadPurchasesBySupplierInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
}

export interface PurchasesBySupplierReport extends PurchasesBySupplier {
  range: ReportPeriod;
}

export async function readPurchasesBySupplier(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: PurchasesReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked }: ReadPurchasesBySupplierInput,
): Promise<PurchasesBySupplierReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const lines = await reader.purchasedLines({ locationId, range });
  return { range, ...purchasesBySupplier(lines) };
}
