import type {
  FindCountableProductOutcome,
  ReadInitialCountOutcome,
  RecordInitialCountLineOutcome,
  SearchCountableProductsOutcome,
  StockCoreToRendererMessage,
  StockRendererToCoreMessage,
  WeighCountedProductOutcome,
  WithdrawInitialCountLineOutcome,
} from "@purosur/contracts";
import type { Scale } from "@purosur/domain/stock/use-cases";
import {
  findCountableProductFor,
  type InitialCountRequestDeps,
  type RecordInitialCountLineRequest,
  readInitialCountFor,
  recordInitialCountLineFor,
  searchCountableProductsFor,
  weighCountedProductFor,
  withdrawInitialCountLineFor,
} from "./initial-count-requests";

export interface InitialCountRequests {
  read: () => Promise<ReadInitialCountOutcome>;
  record: (request: RecordInitialCountLineRequest) => Promise<RecordInitialCountLineOutcome>;
  withdraw: (movementId: string) => Promise<WithdrawInitialCountLineOutcome>;
  find: (code: string) => Promise<FindCountableProductOutcome>;
  search: (query: string) => Promise<SearchCountableProductsOutcome>;
  weigh: (productId: string) => Promise<WeighCountedProductOutcome>;
}

export function createInitialCountRequests(
  deps: InitialCountRequestDeps & { scale: Scale },
): InitialCountRequests {
  return {
    read: () => readInitialCountFor(deps),
    record: (request) => recordInitialCountLineFor(deps, request),
    withdraw: (movementId) => withdrawInitialCountLineFor(deps, movementId),
    find: (code) => findCountableProductFor(deps, code),
    search: (query) => searchCountableProductsFor(deps, query),
    weigh: (productId) => weighCountedProductFor(deps, productId),
  };
}

const UNAVAILABLE = { kind: "unavailable" } as const;

async function attempt<Outcome>(
  reportFailure: (context: string, error: unknown) => void,
  context: string,
  work: (() => Promise<Outcome>) | undefined,
): Promise<Outcome | typeof UNAVAILABLE> {
  try {
    return (await work?.()) ?? UNAVAILABLE;
  } catch (error) {
    reportFailure(context, error);
    return UNAVAILABLE;
  }
}

export async function answerInitialCountRequest(
  {
    initialCount,
    reportFailure,
  }: {
    initialCount: InitialCountRequests | undefined;
    reportFailure: (context: string, error: unknown) => void;
  },
  message: StockRendererToCoreMessage,
): Promise<StockCoreToRendererMessage> {
  const request_id = message.request_id;
  switch (message.type) {
    case "read-initial-count":
      return {
        type: "read-initial-count-result",
        request_id,
        outcome: await attempt(
          reportFailure,
          "reading the initial count",
          initialCount && (() => initialCount.read()),
        ),
      };
    case "record-initial-count-line":
      return {
        type: "record-initial-count-line-result",
        request_id,
        outcome: await attempt(
          reportFailure,
          "recording a line of the initial count",
          initialCount &&
            (() =>
              initialCount.record({
                productId: message.product_id,
                counted: message.counted,
                expiresOn: message.expires_on,
              })),
        ),
      };
    case "withdraw-initial-count-line":
      return {
        type: "withdraw-initial-count-line-result",
        request_id,
        outcome: await attempt(
          reportFailure,
          "withdrawing a line of the initial count",
          initialCount && (() => initialCount.withdraw(message.movement_id)),
        ),
      };
    case "find-countable-product":
      return {
        type: "find-countable-product-result",
        request_id,
        outcome: await attempt(
          reportFailure,
          "finding a product to count by its code",
          initialCount && (() => initialCount.find(message.code)),
        ),
      };
    case "search-countable-products":
      return {
        type: "search-countable-products-result",
        request_id,
        outcome: await attempt(
          reportFailure,
          "searching the products to count by name",
          initialCount && (() => initialCount.search(message.query)),
        ),
      };
    case "weigh-counted-product":
      return {
        type: "weigh-counted-product-result",
        request_id,
        outcome: await attempt(
          reportFailure,
          "weighing a product to count on the scale",
          initialCount && (() => initialCount.weigh(message.product_id)),
        ),
      };
  }
}
