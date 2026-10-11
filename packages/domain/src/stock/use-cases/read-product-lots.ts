import { compareFirstToConsume } from "../model/lot-allocation.js";
import { lotValueCents } from "../model/lot-value.js";
import type { LotInStock, StockLedgerReader } from "./stock-reader.js";

export interface ReadProductLotsInput {
  productId: string;
  locationId: string;
}

export interface ProductLot {
  id: string;
  lotNumber: string | null;
  expiresOn: string | null;
  purchasedOn: string | null;
  technical: boolean;
  remaining: number;
  valueCents: number | null;
  costIncomplete: boolean;
}

export type ReadProductLotsOutcome = { kind: "not_found" } | { kind: "found"; lots: ProductLot[] };

function productLot({ cost, ...lot }: LotInStock): ProductLot {
  return {
    id: lot.id,
    lotNumber: lot.lotNumber,
    expiresOn: lot.expiresOn,
    purchasedOn: lot.purchasedOn,
    technical: lot.technical,
    remaining: lot.remaining,
    valueCents: lotValueCents({
      remaining: lot.remaining,
      cost,
      costIncomplete: lot.costIncomplete,
    }),
    costIncomplete: lot.costIncomplete,
  };
}

export async function readProductLots(
  { ledger }: { ledger: StockLedgerReader },
  input: ReadProductLotsInput,
): Promise<ReadProductLotsOutcome> {
  if (!(await ledger.product(input.productId))) {
    return { kind: "not_found" };
  }
  const lots = await ledger.lotsInStock({
    productId: input.productId,
    locationId: input.locationId,
  });
  return { kind: "found", lots: [...lots].sort(compareFirstToConsume).map(productLot) };
}
