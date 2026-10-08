import type { Clock } from "../../shared/index.js";
import type { BuyerTaxStatusOption } from "../model/buyer-tax-status-set.js";
import type { WsaaTokenReader } from "./arca-online-status-ports.js";
import type { BuyerTaxStatusStore } from "./buyer-tax-status-store.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

export type BuyerTaxStatusFetchResult =
  | { kind: "fetched"; options: BuyerTaxStatusOption[] }
  | { kind: "failed" };

export interface BuyerTaxStatusSource {
  fetchBuyerTaxStatusSet(token: WsaaToken): Promise<BuyerTaxStatusFetchResult>;
}

export interface FetchBuyerTaxStatusSetPorts {
  tokens: WsaaTokenReader;
  source: BuyerTaxStatusSource;
  store: BuyerTaxStatusStore;
  clock: Clock;
}
