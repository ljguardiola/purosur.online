import type { ReceiptDelivery } from "./receipt-copy.js";

export const SALE_PRINT_STANDINGS = [
  "never_printed",
  "outcome_unknown",
  "printed",
  "declined",
] as const;

export type SalePrintStanding = (typeof SALE_PRINT_STANDINGS)[number];

export const UNPRINTED_SALE_STANDINGS = ["never_printed", "outcome_unknown"] as const;

export type UnprintedSaleStanding = (typeof UNPRINTED_SALE_STANDINGS)[number];

export function salePrintStanding({
  printAttemptedAt,
  printedAt,
  printDeclinedAt,
}: Pick<ReceiptDelivery, "printAttemptedAt" | "printedAt" | "printDeclinedAt">): SalePrintStanding {
  if (printAttemptedAt === null) {
    return printDeclinedAt === null ? "never_printed" : "declined";
  }
  return printedAt === null ? "outcome_unknown" : "printed";
}

export function customerReceiptSettled(
  standing: SalePrintStanding,
): standing is Exclude<SalePrintStanding, UnprintedSaleStanding> {
  return standing === "printed" || standing === "declined";
}
