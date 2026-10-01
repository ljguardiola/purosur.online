import type { BuyerTaxStatusOption } from "./buyer-tax-status-set.js";

const CONSUMER_DESCRIPTION = "Consumidor Final";

// ARCA lists the invoice classes an entry admits as letters separated by slashes, such as "A/M/C".
function admitsClassC(option: BuyerTaxStatusOption): boolean {
  return option.invoiceClass.split("/").includes("C");
}

export function selectConsumerBuyerTaxStatus(
  options: readonly BuyerTaxStatusOption[],
): BuyerTaxStatusOption | undefined {
  return options.find(
    (option) => option.description === CONSUMER_DESCRIPTION && admitsClassC(option),
  );
}
