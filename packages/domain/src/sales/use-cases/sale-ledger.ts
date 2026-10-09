import type { SaleUnit, SearchableProduct } from "../../catalog/index.js";
import type {
  BuyerIdentificationThreshold,
  BuyerTaxStatusOption,
  IssuerIdentificationInEffect,
  PreEmissionGateOutcome,
} from "../../fiscal/index.js";
import type { PaymentTransaction, PlannedRefund } from "../../payments/index.js";
import type { RoleAccess } from "../../permissions/index.js";
import type { DiscountRecurrence } from "../../pricing/index.js";
import type { CashMovement } from "../../register/index.js";
import type { OutboxEventDraft } from "../../shared/index.js";
import type { LinePromotion, Sale, SaleLine, SaleWithLines } from "../model/sale.js";
import type { ListPrice } from "../model/sale-line.js";

export interface RegisterIdentity {
  registerId: string;
  deviceId: string;
}

export interface IdGenerator {
  next(): string;
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

export interface RecordedPreEmissionGate {
  saleId: string;
  evaluatedAt: Date;
  outcome: PreEmissionGateOutcome;
}

export interface SaleAuthorizationDecision {
  saleId: string;
  gate: PreEmissionGateOutcome;
  decidedAt: Date;
  ids: IdGenerator;
}

export type SaleCashMovement = CashMovement & { ref: { type: string; id: string } };

export interface SaleRefund extends PlannedRefund {
  id: string;
  saleId: string;
  occurredAt: Date;
}

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
  buyerIdentificationThresholds(): BuyerIdentificationThreshold[];
  priceAt(productId: string, moment: Date): ListPrice | undefined;
  promotionsTargeting(productId: string): CandidatePromotion[];
  recordOpenedSale(sale: Sale): void;
  recordSaleLine(saleId: string, line: SaleLine): void;
  recordLineQuantity(line: SaleLine): void;
  deleteSaleLine(lineId: string): void;
  salePayments(saleId: string): PaymentTransaction[];
  saleCashMovements(saleId: string): SaleCashMovement[];
  discardOpenSale(saleId: string): void;
  recordPayment(payment: PaymentTransaction): void;
  recordCashMovement(movement: CashMovement): void;
  recordCompletedSale(saleId: string, occurredAt: Date): void;
  recordCancelledSale(saleId: string, occurredAt: Date, authorizedBy: string | undefined): void;
  recordRefund(refund: SaleRefund): void;
  outboxReady(): boolean;
  appendOutboxEvent(draft: OutboxEventDraft): void;
  issuerIdentificationInEffect(): IssuerIdentificationInEffect | undefined;
  buyerTaxStatusSetInEffect(): readonly BuyerTaxStatusOption[] | undefined;
  recordPreEmissionGate(recorded: RecordedPreEmissionGate): void;
  decideSaleAuthorization(decision: SaleAuthorizationDecision): void;
}
