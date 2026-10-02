import { expectedBalance } from "../model/stock-count.js";
import type { StockLedgerReader, StockProduct } from "./stock-reader.js";

export interface ExpectedBalanceAtInput {
  productId: string;
  locationId: string;
  at: Date | undefined;
}

export type ExpectedBalanceAtOutcome =
  | { kind: "not_found" }
  | { kind: "invalid_moment" }
  | { kind: "found"; product: StockProduct; balance: number };

export async function expectedBalanceAt(
  { ledger }: { ledger: StockLedgerReader },
  input: ExpectedBalanceAtInput,
): Promise<ExpectedBalanceAtOutcome> {
  const product = await ledger.activeProduct(input.productId);
  if (!product) {
    return { kind: "not_found" };
  }
  if (input.at === undefined) {
    return { kind: "invalid_moment" };
  }
  const balance = expectedBalance(
    await ledger.ledgerAt({ productId: input.productId, locationId: input.locationId }, input.at),
  );
  return { kind: "found", product, balance };
}
