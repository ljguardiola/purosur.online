import type { BuyerTaxStatusOption } from "./buyer-tax-status-set.js";

// ARCA identifies Consumidor Final as Id 5 in the buyer tax-status set its web service returns.
const CONSUMER_CODE = 5;

// ARCA lists the invoice classes an entry admits as letters separated by slashes, such as "A/M/C".
function admitsClassC(option: BuyerTaxStatusOption): boolean {
  return option.invoiceClass.split("/").includes("C");
}

export function selectConsumerBuyerTaxStatus(
  options: readonly BuyerTaxStatusOption[],
): BuyerTaxStatusOption | undefined {
  const consumer = options.find((option) => option.code === CONSUMER_CODE);
  return consumer !== undefined && admitsClassC(consumer) ? consumer : undefined;
}
