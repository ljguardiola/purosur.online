import type {
  BuyerTaxStatusFetchResult,
  BuyerTaxStatusSource,
} from "../buyer-tax-status-source.js";
import type { WsaaToken } from "../wsaa-token-ports.js";

export class FakeBuyerTaxStatusSource implements BuyerTaxStatusSource {
  readonly fetchedWith: WsaaToken[] = [];
  private readonly result: BuyerTaxStatusFetchResult;
  private readonly whileFetching: () => void;

  constructor(result: BuyerTaxStatusFetchResult, whileFetching: () => void = () => {}) {
    this.result = result;
    this.whileFetching = whileFetching;
  }

  async fetchBuyerTaxStatusSet(token: WsaaToken): Promise<BuyerTaxStatusFetchResult> {
    this.fetchedWith.push({ ...token });
    this.whileFetching();
    return this.result;
  }
}
