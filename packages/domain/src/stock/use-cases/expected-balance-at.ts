import type { ZoneRulesSource } from "../../shared/index.js";
import { compareFirstToConsume } from "../model/lot-allocation.js";
import { isCountableByLot, lotsAtMoment } from "../model/lot-count.js";
import type { LotName } from "../model/lot-name.js";
import { expectedBalance } from "../model/stock-count.js";
import type { LotNameReader } from "./lot-name-reader.js";
import { nameLotsOfProducts, nameOf } from "./name-lots.js";
import type { StockLedgerReader, StockProduct } from "./stock-reader.js";

export interface ExpectedBalanceAtInput {
  productId: string;
  locationId: string;
  at: Date | undefined;
}

export interface CountableLot {
  id: string;
  name: LotName;
  expiresOn: string | null;
  expected: number;
}

export type ExpectedBalanceAtOutcome =
  | { kind: "not_found" }
  | { kind: "invalid_moment" }
  | { kind: "found"; product: StockProduct; balance: number; lots: CountableLot[] };

export async function expectedBalanceAt(
  {
    ledger,
    lotNames,
    zoneRules,
  }: { ledger: StockLedgerReader; lotNames: LotNameReader; zoneRules: ZoneRulesSource },
  input: ExpectedBalanceAtInput,
): Promise<ExpectedBalanceAtOutcome> {
  const product = await ledger.product(input.productId);
  if (!product) {
    return { kind: "not_found" };
  }
  if (input.at === undefined) {
    return { kind: "invalid_moment" };
  }
  const atMoment = await ledger.ledgerAt(
    { productId: input.productId, locationId: input.locationId },
    input.at,
  );
  const names = await nameLotsOfProducts({ lotNames, zoneRules }, input.locationId, [
    input.productId,
  ]);
  const lots = lotsAtMoment(atMoment.lots, atMoment.lotAllocationsAfter)
    .filter(isCountableByLot)
    .sort(compareFirstToConsume)
    .map(({ id, expiresOn, remaining }) => ({
      id,
      name: nameOf(names, id),
      expiresOn,
      expected: remaining,
    }));
  return { kind: "found", product, balance: expectedBalance(atMoment), lots };
}
