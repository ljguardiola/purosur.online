import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import { type SaleForReturnOutcome, saleForReturnOutcome } from "../model/sale-for-return-view.js";
import type { ReturnSaleReader, SaleReturnSearch } from "./return-ports.js";

export type { ReturnableLineView, SaleForReturnView } from "../model/sale-for-return-view.js";

export type FindSaleForReturnOutcome = SaleForReturnOutcome;

export type FindSaleForReturnInput = SaleReturnSearch;

export interface FindSaleForReturnPorts {
  reader: ReturnSaleReader;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export function findSaleForReturn(
  { reader, clock, zoneRules }: FindSaleForReturnPorts,
  search: FindSaleForReturnInput,
): FindSaleForReturnOutcome {
  return saleForReturnOutcome(
    reader.saleForReturn(search),
    reader.goodConditionReturnDays(),
    clock.now(),
    zoneRules.zoneRules(),
  );
}
