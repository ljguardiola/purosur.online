import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import type { SaleForReturn } from "../model/return-sale.js";
import { saleForReturnOutcome } from "../model/sale-for-return-view.js";
import { withReturnsOfBranch, withUncountedReturns } from "../model/uncounted-returns.js";
import type { FindSaleForReturnInput, FindSaleForReturnOutcome } from "./find-sale-for-return.js";
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
  const outcomeOf = (facts: SaleForReturn | undefined) =>
    saleForReturnOutcome(
      facts,
      reader.goodConditionReturnDays(),
      clock.now(),
      zoneRules.zoneRules(),
    );
  const held = reader.saleForReturn(search);
  const local = outcomeOf(held);
  if (search.kind === "sale" || (held !== undefined && local.kind !== "found")) {
    return local;
  }
  const answer = await lookup.saleForReturn(search);
  if (held !== undefined) {
    if (answer.kind !== "found" || answer.sale.sale.id !== held.sale.id) {
      return local;
    }
    const { sale, invoiceStanding, countedReturnIds } = answer;
    retained.keep({ sale, invoiceStanding, ticket: search, countedReturnIds });
    return outcomeOf(
      withReturnsOfBranch(held, sale, countedReturnIds, ownReturns.returnsOfSale(held.sale.id)),
    );
  }
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
  const outcome = outcomeOf(
    withUncountedReturns(sale, countedReturnIds, ownReturns.returnsOfSale(sale.sale.id)),
  );
  if (outcome.kind === "found") {
    retained.keep({ sale, invoiceStanding, ticket: search, countedReturnIds });
  }
  return outcome;
}
