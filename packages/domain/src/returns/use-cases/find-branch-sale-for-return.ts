import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import { saleForReturnOutcome } from "../model/sale-for-return-view.js";
import { withUncountedReturns } from "../model/uncounted-returns.js";
import type { FindSaleForReturnInput, FindSaleForReturnOutcome } from "./find-sale-for-return.js";
import { findSaleForReturn } from "./find-sale-for-return.js";
import type {
  BranchSaleLookup,
  OwnReturnsOfSale,
  RetainedBranchSales,
  ReturnSaleReader,
} from "./return-ports.js";

export type FindBranchSaleForReturnInput = FindSaleForReturnInput;

export type FindBranchSaleForReturnOutcome =
  | FindSaleForReturnOutcome
  | { kind: "needs_connection" }
  | { kind: "lookup_failed" };

export interface FindBranchSaleForReturnPorts {
  reader: ReturnSaleReader;
  lookup: BranchSaleLookup;
  ownReturns: OwnReturnsOfSale;
  retained: RetainedBranchSales;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export async function findBranchSaleForReturn(
  { reader, lookup, ownReturns, retained, clock, zoneRules }: FindBranchSaleForReturnPorts,
  search: FindBranchSaleForReturnInput,
): Promise<FindBranchSaleForReturnOutcome> {
  const local = findSaleForReturn({ reader, clock, zoneRules }, search);
  if (local.kind !== "not_found" || search.kind === "sale") {
    return local;
  }
  const answer = await lookup.saleForReturn(search);
  if (answer.kind === "unreachable") {
    return { kind: "needs_connection" };
  }
  if (answer.kind === "not_found") {
    return { kind: "not_found" };
  }
  if (answer.kind === "failed") {
    return { kind: "lookup_failed" };
  }
  const { sale, invoiceStanding, countedReturnIds } = answer;
  const outcome = saleForReturnOutcome(
    withUncountedReturns(sale, countedReturnIds, ownReturns.returnsOfSale(sale.sale.id)),
    reader.goodConditionReturnDays(),
    clock.now(),
    zoneRules.zoneRules(),
  );
  if (outcome.kind === "found") {
    retained.keep({
      sale,
      invoiceStanding,
      ticket: search,
      countedReturnIds,
    });
  }
  return outcome;
}
