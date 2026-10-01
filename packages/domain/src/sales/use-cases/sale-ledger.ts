import type { RoleAccess } from "../../access/index.js";
import type { SaleUnit } from "../../catalog/index.js";
import type { DiscountRecurrence } from "../../pricing/index.js";
import type { CashMovement } from "../../register/index.js";
import type { OutboxEventDraft } from "../../sync/index.js";
import type { PaymentTransaction } from "../model/payment.js";
import type { SearchableProduct } from "../model/product-search.js";
import type { LinePromotion, Sale, SaleLine, SaleWithLines } from "../model/sale.js";
import type { ListPrice } from "../model/sale-line.js";

export interface RegisterIdentity {
  registerId: string;
  deviceId: string;
}

export interface IdGenerator {
  next(): string;
}

export interface Clock {
  now(): Date;
}

export interface SellingSession {
  id: string;
  openedBy: string;
}

export interface SellableProduct {
  id: string;
  name: string;
  saleUnit: SaleUnit;
}

export interface CandidatePromotion extends LinePromotion, DiscountRecurrence {}

export interface SaleLedger {
  transaction<TOutcome>(work: (tx: SaleLedgerTransaction) => TOutcome): TOutcome;
}

export interface SaleLedgerTransaction {
  sellerAccess(userId: string): RoleAccess | undefined;
  openSession(): SellingSession | undefined;
  openSale(sessionId: string): SaleWithLines | undefined;
  installationRevoked(): boolean;
  registerIdentity(): RegisterIdentity | undefined;
  activeProductByBarcode(code: string): SellableProduct | undefined;
  activeProductById(productId: string): SellableProduct | undefined;
  searchableProducts(): SearchableProduct[];
  priceAt(productId: string, moment: Date): ListPrice | undefined;
  promotionsTargeting(productId: string): CandidatePromotion[];
  recordOpenedSale(sale: Sale): void;
  recordSaleLine(saleId: string, line: SaleLine): void;
  recordLineQuantity(line: SaleLine): void;
  recordPayment(payment: PaymentTransaction): void;
  recordCashMovement(movement: CashMovement): void;
  recordCompletedSale(saleId: string): void;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}
