import type { ReceiptDelivery } from "./receipt-copy.js";

export const SALE_PRINT_STANDINGS = ["never_printed", "outcome_unknown", "printed"] as const;

export type SalePrintStanding = (typeof SALE_PRINT_STANDINGS)[number];

export const UNPRINTED_SALE_STANDINGS = ["never_printed", "outcome_unknown"] as const;

export type UnprintedSaleStanding = (typeof UNPRINTED_SALE_STANDINGS)[number];

export function salePrintStanding({
  printAttemptedAt,
  printedAt,
}: Pick<ReceiptDelivery, "printAttemptedAt" | "printedAt">): SalePrintStanding {
  if (printAttemptedAt === null) {
    return "never_printed";
  }
  return printedAt === null ? "outcome_unknown" : "printed";
}
