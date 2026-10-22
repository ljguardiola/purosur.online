import { type BuyerTaxStatusBody, buyerTaxStatusListSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudList } from "./fiscal-api-request";

export type BuyerTaxStatus = { code: number; description: string };

export type FetchBuyerTaxStatusesOutcome = CloudReadOutcome<BuyerTaxStatus[]>;

function buyerTaxStatusFromWire({ code, description }: BuyerTaxStatusBody): BuyerTaxStatus {
  return { code, description };
}

export function fetchBuyerTaxStatuses(): Promise<FetchBuyerTaxStatusesOutcome> {
  return readCloudList("/api/registers/buyer-tax-statuses", (body) =>
    buyerTaxStatusListSchema.safeParse(body).data?.map(buyerTaxStatusFromWire),
  );
}
