export interface Clock {
  now(): Date;
}

export interface PricingPorts {
  store: PricingStore;
  clock: Clock;
}

export interface CurrentPrice {
  id: string;
  unitPrice: number;
  validFrom: Date;
}

export type LockActiveProductResult = { kind: "not_found" } | { kind: "locked" };

export interface NewPrice {
  productId: string;
  priceListId: string;
  unitPrice: number;
  validFrom: Date;
}

export interface NewPriceReview {
  productId: string;
  priceListId: string;
  reviewedAt: Date;
  actorId: string;
  priceId: string;
}

export interface PriceChange {
  productId: string;
  actorId: string;
  previous: { priceId: string; unitPrice: number } | null;
  next: { priceId: string; unitPrice: number };
}

export interface PriceConfirmation {
  productId: string;
  actorId: string;
  priceId: string;
}

export interface PricingStore {
  transaction<TOutcome>(
    work: (tx: PricingStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PricingStoreTransaction {
  lockActiveProduct(productId: string): Promise<LockActiveProductResult>;
  branchPriceList(locationId: string): Promise<string>;
  currentPrice(productId: string, priceListId: string): Promise<CurrentPrice | undefined>;
  latestReviewedAt(productId: string, priceListId: string): Promise<Date | undefined>;
  recordPrice(price: NewPrice): Promise<CurrentPrice>;
  recordPriceReview(review: NewPriceReview): Promise<void>;
  recordPriceChange(change: PriceChange): Promise<void>;
  recordPriceConfirmation(confirmation: PriceConfirmation): Promise<void>;
}
