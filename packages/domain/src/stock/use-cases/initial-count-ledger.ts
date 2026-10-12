import type { SaleUnit, SearchableProduct } from "../../catalog/index.js";
import type { RoleAccess } from "../../permissions/index.js";
import type { OutboxEventDraft } from "../../shared/index.js";

export interface CountableProduct {
  id: string;
  name: string;
  saleUnit: SaleUnit;
}

export type InitialCountMovementKind = "opening_count" | "opening_count_withdrawal";

export interface InitialCountMovement {
  id: string;
  productId: string;
  kind: InitialCountMovementKind;
  delta: number;
  occurredAt: Date;
  expiresOn: string | null;
  withdrawsMovementId: string | null;
}

export interface InitialCountLine {
  movementId: string;
  productId: string;
  productName: string;
  saleUnit: SaleUnit;
  counted: number;
  expiresOn: string | null;
  confirmedAt: Date;
  withdrawn: boolean;
}

export interface InitialCountIds {
  next(): string;
}

export type CountScaleReading =
  | { kind: "stable"; weightThousandths: number }
  | { kind: "not_stable" }
  | { kind: "unavailable" };

export interface CountScale {
  read(): Promise<CountScaleReading>;
}

export interface InitialCountLedger {
  transaction<TOutcome>(work: (tx: InitialCountTransaction) => TOutcome): TOutcome;
}

export interface InitialCountTransaction {
  actorAccess(userId: string): RoleAccess | undefined;
  branchFirstSessionOpened(): boolean;
  ownSessionEverOpened(): boolean;
  outboxReady(): boolean;
  activeProductById(productId: string): CountableProduct | undefined;
  activeProductByBarcode(code: string): CountableProduct | undefined;
  searchableProducts(): SearchableProduct[];
  initialCountLine(movementId: string): InitialCountLine | undefined;
  notWithdrawnInitialCountLines(): InitialCountLine[];
  recordInitialCountMovement(movement: InitialCountMovement): void;
  addToStockBalance(productId: string, delta: number): void;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}
