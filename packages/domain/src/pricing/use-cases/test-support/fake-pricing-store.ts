import type { Clock } from "../../../shared/index.js";
import { newestPrice } from "../../model/current-price.js";
import type {
  CurrentPrice,
  LockActiveProductResult,
  NewPrice,
  NewPriceReview,
  PriceChange,
  PriceConfirmation,
  PriceReviewPostponementsResolution,
  PricingStore,
  PricingStoreTransaction,
  RecordedPriceReview,
} from "../pricing-store.js";

export interface FakeBranchRow {
  locationId: string;
  priceListId: string;
}

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

interface FakeReviewRow extends NewPriceReview {
  id: string;
}

export interface FakePostponementRow {
  id: string;
  productId: string;
  priceListId: string;
  resolvedByReviewId: string | null;
}

export interface FakePriceState {
  branches: FakeBranchRow[];
  products: FakeProductRow[];
  prices: FakePriceRow[];
  reviews: FakeReviewRow[];
  postponements: FakePostponementRow[];
  priceChanges: PriceChange[];
  priceConfirmations: PriceConfirmation[];
  nextId: number;
  nextReviewId: number;
}

type WriteOperation =
  | "recordPrice"
  | "recordPriceReview"
  | "resolvePriceReviewPostponements"
  | "recordPriceChange"
  | "recordPriceConfirmation";

function cloneState(state: FakePriceState): FakePriceState {
  return {
    branches: state.branches.map((row) => ({ ...row })),
    products: state.products.map((row) => ({ ...row })),
    prices: state.prices.map((row) => ({ ...row, validFrom: new Date(row.validFrom) })),
    reviews: state.reviews.map((row) => ({ ...row, reviewedAt: new Date(row.reviewedAt) })),
    postponements: state.postponements.map((row) => ({ ...row })),
    priceChanges: state.priceChanges.map((row) => ({
      ...row,
      previous: row.previous && { ...row.previous },
      next: { ...row.next },
    })),
    priceConfirmations: state.priceConfirmations.map((row) => ({ ...row })),
    nextId: state.nextId,
    nextReviewId: state.nextReviewId,
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

  async branchPriceList(locationId: string): Promise<string> {
    this.store.operationOrder.push("branchPriceList");
    const branch = this.state.branches.find((row) => row.locationId === locationId);
    if (!branch) {
      throw new Error(`branch ${locationId} has no price list`);
    }
    return branch.priceListId;
  }

  async currentPrice(productId: string, priceListId: string): Promise<CurrentPrice | undefined> {
    this.store.operationOrder.push("currentPrice");
    const newest = newestPrice(
      this.state.prices.filter(
        (row) => row.productId === productId && row.priceListId === priceListId,
      ),
    );
    return newest && { id: newest.id, unitPrice: newest.unitPrice, validFrom: newest.validFrom };
  }

  async latestReviewedAt(productId: string, priceListId: string): Promise<Date | undefined> {
    this.store.operationOrder.push("latestReviewedAt");
    const [latest] = this.state.reviews
      .filter((row) => row.productId === productId && row.priceListId === priceListId)
      .map((row) => row.reviewedAt)
      .sort((a, b) => b.getTime() - a.getTime());
    return latest && new Date(latest);
  }

  async recordPrice(price: NewPrice): Promise<CurrentPrice> {
    this.beforeWrite("recordPrice");
    const id = `price-${this.state.nextId++}`;
    this.state.prices.push({ id, ...price });
    return { id, unitPrice: price.unitPrice, validFrom: price.validFrom };
  }

  async recordPriceReview(review: NewPriceReview): Promise<RecordedPriceReview> {
    this.beforeWrite("recordPriceReview");
    const id = `review-${this.state.nextReviewId++}`;
    this.state.reviews.push({ id, ...review });
    return { id };
  }

  async resolvePriceReviewPostponements(
    resolution: PriceReviewPostponementsResolution,
  ): Promise<void> {
    this.beforeWrite("resolvePriceReviewPostponements");
    for (const row of this.state.postponements) {
      if (
        row.productId === resolution.productId &&
        row.priceListId === resolution.priceListId &&
        row.resolvedByReviewId === null
      ) {
        row.resolvedByReviewId = resolution.reviewId;
      }
    }
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
    branches: [],
    products: [],
    prices: [],
    reviews: [],
    postponements: [],
    priceChanges: [],
    priceConfirmations: [],
    nextId: 1,
    nextReviewId: 1,
  };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];
  transactionCount = 0;

  seedBranch(branch: FakeBranchRow): void {
    this.state.branches.push({ ...branch });
  }

  seedProduct(product: FakeProductRow): void {
    this.state.products.push({ ...product });
  }

  seedPrice(price: FakePriceRow): void {
    this.state.prices.push({ ...price });
  }

  seedReview(review: NewPriceReview): void {
    this.state.reviews.push({ id: `review-${this.state.nextReviewId++}`, ...review });
  }

  seedPostponement(
    postponement: Omit<FakePostponementRow, "resolvedByReviewId"> & {
      resolvedByReviewId?: string;
    },
  ): void {
    this.state.postponements.push({ resolvedByReviewId: null, ...postponement });
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
