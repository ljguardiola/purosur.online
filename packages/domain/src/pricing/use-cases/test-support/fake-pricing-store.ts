import type {
  Clock,
  CurrentPrice,
  LockActiveProductResult,
  NewPrice,
  NewPriceReview,
  PriceChange,
  PriceConfirmation,
  PricingStore,
  PricingStoreTransaction,
} from "../pricing-store.js";

export interface FakeProductRow {
  id: string;
  active: boolean;
}

export interface FakePriceRow {
  id: string;
  productId: string;
  priceListId: string;
  unitPrice: number;
  validFrom: Date;
}

export interface FakePriceState {
  products: FakeProductRow[];
  prices: FakePriceRow[];
  reviews: NewPriceReview[];
  priceChanges: PriceChange[];
  priceConfirmations: PriceConfirmation[];
  nextId: number;
}

type WriteOperation =
  | "recordPrice"
  | "recordPriceReview"
  | "recordPriceChange"
  | "recordPriceConfirmation";

function cloneState(state: FakePriceState): FakePriceState {
  return {
    products: state.products.map((row) => ({ ...row })),
    prices: state.prices.map((row) => ({ ...row, validFrom: new Date(row.validFrom) })),
    reviews: state.reviews.map((row) => ({ ...row, reviewedAt: new Date(row.reviewedAt) })),
    priceChanges: state.priceChanges.map((row) => ({
      ...row,
      previous: row.previous && { ...row.previous },
      next: { ...row.next },
    })),
    priceConfirmations: state.priceConfirmations.map((row) => ({ ...row })),
    nextId: state.nextId,
  };
}

class FakePricingStoreTransaction implements PricingStoreTransaction {
  private readonly state: FakePriceState;
  private readonly store: FakePricingStore;

  constructor(state: FakePriceState, store: FakePricingStore) {
    this.state = state;
    this.store = store;
  }

  async lockActiveProduct(productId: string): Promise<LockActiveProductResult> {
    this.store.operationOrder.push("lockActiveProduct");
    const product = this.state.products.find((row) => row.id === productId);
    return product?.active ? { kind: "locked" } : { kind: "not_found" };
  }

  async currentPrice(productId: string, priceListId: string): Promise<CurrentPrice | undefined> {
    this.store.operationOrder.push("currentPrice");
    const [newest] = this.state.prices
      .filter((row) => row.productId === productId && row.priceListId === priceListId)
      .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
    return newest && { id: newest.id, unitPrice: newest.unitPrice, validFrom: newest.validFrom };
  }

  async latestReviewedAt(productId: string, priceListId: string): Promise<Date | undefined> {
    this.store.operationOrder.push("latestReviewedAt");
    const times = this.state.reviews
      .filter((row) => row.productId === productId && row.priceListId === priceListId)
      .map((row) => row.reviewedAt.getTime());
    return times.length === 0 ? undefined : new Date(Math.max(...times));
  }

  async recordPrice(price: NewPrice): Promise<CurrentPrice> {
    this.beforeWrite("recordPrice");
    const id = `price-${this.state.nextId++}`;
    this.state.prices.push({ id, ...price });
    return { id, unitPrice: price.unitPrice, validFrom: price.validFrom };
  }

  async recordPriceReview(review: NewPriceReview): Promise<void> {
    this.beforeWrite("recordPriceReview");
    this.state.reviews.push({ ...review });
  }

  async recordPriceChange(change: PriceChange): Promise<void> {
    this.beforeWrite("recordPriceChange");
    this.state.priceChanges.push({ ...change });
  }

  async recordPriceConfirmation(confirmation: PriceConfirmation): Promise<void> {
    this.beforeWrite("recordPriceConfirmation");
    this.state.priceConfirmations.push({ ...confirmation });
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakePricingStore implements PricingStore {
  private state: FakePriceState = {
    products: [],
    prices: [],
    reviews: [],
    priceChanges: [],
    priceConfirmations: [],
    nextId: 1,
  };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];
  transactionCount = 0;

  seedProduct(product: FakeProductRow): void {
    this.state.products.push({ ...product });
  }

  seedPrice(price: FakePriceRow): void {
    this.state.prices.push({ ...price });
  }

  seedReview(review: NewPriceReview): void {
    this.state.reviews.push({ ...review });
  }

  snapshot(): FakePriceState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: PricingStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    try {
      return await work(new FakePricingStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}

export class FixedClock implements Clock {
  private readonly moment: Date;

  constructor(moment: Date) {
    this.moment = moment;
  }

  now(): Date {
    return new Date(this.moment);
  }
}
