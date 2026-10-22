import {
  type BuyerIdentificationThreshold,
  type BuyerTaxStatusOption,
  type IssuerIdentificationInEffect,
  latestBuyerTaxStatusSet,
  latestIssuerIdentification,
} from "../../../fiscal/index.js";
import type {
  PaidOrderDiscoveryState,
  PendingMercadoPagoSalePayment,
  SalePayment,
} from "../../../payments/index.js";
import type { RoleAccess } from "../../../permissions/index.js";
import { newestPrice } from "../../../pricing/index.js";
import {
  type CashMovement,
  nextOperationNumber,
  type RestorationEvidence,
} from "../../../register/index.js";
import type { Clock, OutboxEventDraft } from "../../../shared/index.js";
import type { SaleWithLines } from "../../model/sale.js";
import type { ListPrice } from "../../model/sale-line.js";
import type { RegisterRestoration } from "../register-restoration.js";
import type {
  CandidatePromotion,
  IdGenerator,
  RecordedPreEmissionGate,
  RegisterIdentity,
  SaleAuthorizationDecision,
  SaleCashMovement,
  SaleLedger,
  SaleLedgerTransaction,
  SaleRefund,
  SaleStockMovement,
  SellableProduct,
  SellingSession,
} from "../sale-ledger.js";

const RESTORATION_COMPLETED: RestorationEvidence = {
  enroll: "completed",
  restore: "completed",
  reset_sync_identity: "completed",
  replenish: "completed",
};

export const RESTORATION_IN_PROGRESS: RestorationEvidence = {
  ...RESTORATION_COMPLETED,
  replenish: "pending",
};

interface FakePrice extends ListPrice {
  id: string;
  productId: string;
  validFrom: Date;
}

type StoredSale = SaleWithLines & {
  occurredAt?: Date;
  authorizedBy?: string;
  operationNumber?: number;
};

export interface FakeSaleLedgerState {
  accesses: Record<string, RoleAccess>;
  identity: RegisterIdentity | undefined;
  revoked: boolean;
  newSalesStoppedByDisk: boolean;
  localDatabaseDamaged: boolean;
  newSalesStoppedByBattery: boolean;
  paidOrdersWithoutSale: { resolved: boolean }[];
  paidOrderDiscovery: PaidOrderDiscoveryState;
  session: SellingSession | undefined;
  restoration: RestorationEvidence;
  products: SellableProduct[];
  barcodes: Record<string, string>;
  prices: FakePrice[];
  thresholds: BuyerIdentificationThreshold[];
  promotionsByProduct: Record<string, CandidatePromotion[]>;
  sales: StoredSale[];
  payments: SalePayment[];
  pendingMercadoPagoPayments: PendingMercadoPagoSalePayment[];
  replacedQrPaymentIds: string[];
  refunds: SaleRefund[];
  movements: CashMovement[];
  stockMovements: SaleStockMovement[];
  stockBalances: Record<string, number>;
  lastOperationNumber: number;
  outbox: OutboxEventDraft[];
  outboxReady: boolean;
  issuerIdentifications: IssuerIdentificationInEffect[];
  buyerTaxStatusSets: { paramsVersion: number; options: BuyerTaxStatusOption[] }[];
  preEmissionGates: RecordedPreEmissionGate[];
  authorizationDecisions: Omit<SaleAuthorizationDecision, "ids">[];
}

export type FakeSaleLedgerWrite =
  | "recordOpenedSale"
  | "recordSaleLine"
  | "recordChangedLine"
  | "recordSaleDiscount"
  | "deleteSaleLine"
  | "discardOpenSale"
  | "recordPayment"
  | "recordPendingMercadoPagoPayment"
  | "approvePendingMercadoPagoPayment"
  | "markQrPaymentReplaced"
  | "recordCashMovement"
  | "recordSaleStockMovement"
  | "addToStockBalance"
  | "takeOperationNumber"
  | "recordCompletedSale"
  | "recordCancelledSale"
  | "recordRefund"
  | "recordPreEmissionGate"
  | "decideSaleAuthorization"
  | "appendOutboxEvent";

export class FakeSaleLedger implements SaleLedger {
  state: FakeSaleLedgerState;
  transactions = 0;
  promotionReads = 0;
  barcodeLookups = 0;
  searchableReads = 0;
  failOn: FakeSaleLedgerWrite | undefined;
  readonly restoration: RegisterRestoration = { evidence: () => this.state.restoration };

  constructor(state: Partial<FakeSaleLedgerState> = {}) {
    this.state = {
      accesses: {},
      identity: undefined,
      revoked: false,
      newSalesStoppedByDisk: false,
      localDatabaseDamaged: false,
      newSalesStoppedByBattery: false,
      paidOrdersWithoutSale: [],
      paidOrderDiscovery: "checked",
      session: undefined,
      restoration: RESTORATION_COMPLETED,
      products: [],
      barcodes: {},
      prices: [],
      thresholds: [],
      promotionsByProduct: {},
      sales: [],
      payments: [],
      pendingMercadoPagoPayments: [],
      replacedQrPaymentIds: [],
      refunds: [],
      movements: [],
      stockMovements: [],
      stockBalances: {},
      lastOperationNumber: 0,
      outbox: [],
      outboxReady: true,
      issuerIdentifications: [],
      buyerTaxStatusSets: [],
      preEmissionGates: [],
      authorizationDecisions: [],
      ...state,
    };
  }

  transaction<TOutcome>(work: (tx: SaleLedgerTransaction) => TOutcome): TOutcome {
    this.transactions += 1;
    const working = structuredClone(this.state);
    const outcome = work({
      sellerAccess: (userId) => working.accesses[userId],
      openSession: () => working.session,
      openSale: (sessionId) => {
        const sale = working.sales.find(
          (stored) => stored.sessionId === sessionId && stored.state === "OPEN",
        );
        return sale && structuredClone(sale);
      },
      installationRevoked: () => working.revoked,
      newSalesStoppedByDisk: () => working.newSalesStoppedByDisk,
      localDatabaseDamaged: () => working.localDatabaseDamaged,
      newSalesStoppedByBattery: () => working.newSalesStoppedByBattery,
      paidOrdersWithoutSale: () => structuredClone(working.paidOrdersWithoutSale),
      paidOrderDiscovery: () => working.paidOrderDiscovery,
      registerIdentity: () => working.identity,
      activeProductByBarcode: (code) => {
        this.barcodeLookups += 1;
        return working.products.find((product) => product.id === working.barcodes[code]);
      },
      activeProductById: (productId) =>
        working.products.find((product) => product.id === productId),
      searchableProducts: () => {
        this.searchableReads += 1;
        return working.products.map((product) => ({
          ...product,
          timesSoldHere: completedSalesContaining(working, product.id),
        }));
      },
      buyerIdentificationThresholds: () => structuredClone(working.thresholds),
      currentPrice: (productId) => newestPriceOf(working.prices, productId),
      promotionsTargeting: (productId) => {
        this.promotionReads += 1;
        return structuredClone(working.promotionsByProduct[productId] ?? []);
      },
      recordOpenedSale: (sale) => {
        this.failIfAsked("recordOpenedSale");
        working.sales.push({ ...sale, saleDiscount: null, lines: [] });
      },
      recordSaleLine: (saleId, line) => {
        this.failIfAsked("recordSaleLine");
        working.sales.find((sale) => sale.id === saleId)?.lines.push(line);
      },
      recordChangedLine: (line) => {
        this.failIfAsked("recordChangedLine");
        for (const sale of working.sales) {
          sale.lines = sale.lines.map((stored) =>
            stored.id === line.id
              ? {
                  ...stored,
                  quantity: line.quantity,
                  weightSource: line.weightSource,
                  manualAdjustment: line.manualAdjustment,
                  promotionId: line.promotionId,
                  discountAmount: line.discountAmount,
                  lineTotal: line.lineTotal,
                }
              : stored,
          );
        }
      },
      recordSaleDiscount: (saleId, discount) => {
        this.failIfAsked("recordSaleDiscount");
        const sale = working.sales.find((stored) => stored.id === saleId);
        if (sale) {
          sale.saleDiscount = discount;
        }
      },
      deleteSaleLine: (lineId) => {
        this.failIfAsked("deleteSaleLine");
        for (const sale of working.sales) {
          sale.lines = sale.lines.filter((stored) => stored.id !== lineId);
        }
      },
      salePayments: (saleId) =>
        structuredClone(working.payments.filter((payment) => payment.saleId === saleId)),
      saleCashMovements: (saleId) =>
        structuredClone(
          working.movements.filter(
            (movement): movement is SaleCashMovement =>
              movement.ref?.type === "sale" && movement.ref.id === saleId,
          ),
        ),
      discardOpenSale: (saleId) => {
        this.failIfAsked("discardOpenSale");
        working.sales = working.sales.filter((stored) => stored.id !== saleId);
      },
      recordPayment: (payment) => {
        this.failIfAsked("recordPayment");
        working.payments.push(payment);
      },
      recordPendingMercadoPagoPayment: (payment) => {
        this.failIfAsked("recordPendingMercadoPagoPayment");
        working.pendingMercadoPagoPayments.push(payment);
      },
      pendingMercadoPagoPayment: (paymentTransactionId) => {
        const pending = working.pendingMercadoPagoPayments.find(
          ({ id }) => id === paymentTransactionId && !working.replacedQrPaymentIds.includes(id),
        );
        return pending && structuredClone(pending);
      },
      markQrPaymentReplaced: (paymentTransactionId, waitEndsAt) => {
        this.failIfAsked("markQrPaymentReplaced");
        const pending = working.pendingMercadoPagoPayments.find(
          ({ id }) => id === paymentTransactionId,
        );
        if (pending === undefined) {
          return;
        }
        pending.waitEndsAt = waitEndsAt;
        working.replacedQrPaymentIds.push(paymentTransactionId);
      },
      pendingMercadoPagoPaymentsOf: (saleId) =>
        structuredClone(
          working.pendingMercadoPagoPayments.filter((pending) => pending.saleId === saleId),
        ),
      approvePendingMercadoPagoPayment: (paymentTransactionId) => {
        this.failIfAsked("approvePendingMercadoPagoPayment");
        const pending = working.pendingMercadoPagoPayments.find(
          ({ id }) => id === paymentTransactionId,
        );
        if (pending === undefined) {
          return;
        }
        working.pendingMercadoPagoPayments = working.pendingMercadoPagoPayments.filter(
          ({ id }) => id !== paymentTransactionId,
        );
        working.payments.push({
          id: pending.id,
          saleId: pending.saleId,
          kind: "SALE",
          method: pending.method,
          provider: pending.provider,
          amount: pending.amount,
          state: "APPROVED",
          occurredAt: pending.occurredAt,
        } as SalePayment);
      },
      recordCashMovement: (movement) => {
        this.failIfAsked("recordCashMovement");
        working.movements.push(movement);
      },
      recordSaleStockMovement: (movement) => {
        this.failIfAsked("recordSaleStockMovement");
        working.stockMovements.push(movement);
      },
      addToStockBalance: (productId, delta) => {
        this.failIfAsked("addToStockBalance");
        working.stockBalances[productId] = (working.stockBalances[productId] ?? 0) + delta;
      },
      takeOperationNumber: () => {
        this.failIfAsked("takeOperationNumber");
        working.lastOperationNumber = nextOperationNumber(working.lastOperationNumber);
        return working.lastOperationNumber;
      },
      recordCompletedSale: (saleId, occurredAt, operationNumber) => {
        this.failIfAsked("recordCompletedSale");
        for (const sale of working.sales) {
          if (sale.id === saleId) {
            sale.state = "COMPLETED";
            sale.occurredAt = occurredAt;
            sale.operationNumber = operationNumber;
          }
        }
      },
      recordCancelledSale: (saleId, occurredAt, authorizedBy) => {
        this.failIfAsked("recordCancelledSale");
        for (const sale of working.sales) {
          if (sale.id === saleId) {
            sale.state = "CANCELLED";
            sale.occurredAt = occurredAt;
            if (authorizedBy !== undefined) {
              sale.authorizedBy = authorizedBy;
            }
          }
        }
      },
      recordRefund: (refund) => {
        this.failIfAsked("recordRefund");
        working.refunds.push(refund);
      },
      outboxReady: () => working.outboxReady,
      appendOutboxEvent: (draft) => {
        this.failIfAsked("appendOutboxEvent");
        working.outbox.push(draft);
      },
      issuerIdentificationInEffect: () => latestIssuerIdentification(working.issuerIdentifications),
      buyerTaxStatusSetInEffect: () => latestBuyerTaxStatusSet(working.buyerTaxStatusSets)?.options,
      recordPreEmissionGate: (recorded) => {
        this.failIfAsked("recordPreEmissionGate");
        working.preEmissionGates.push(recorded);
      },
      decideSaleAuthorization: ({ ids: _ids, ...decision }) => {
        this.failIfAsked("decideSaleAuthorization");
        working.authorizationDecisions.push(decision);
      },
    });
    this.state = working;
    return outcome;
  }

  private failIfAsked(write: FakeSaleLedgerWrite): void {
    if (this.failOn === write) {
      throw new Error(`${write} failed`);
    }
  }
}

function completedSalesContaining(state: FakeSaleLedgerState, productId: string): number {
  return state.sales.filter(
    (sale) =>
      sale.state === "COMPLETED" &&
      sale.registerId === state.identity?.registerId &&
      sale.lines.some((line) => line.productId === productId),
  ).length;
}

function newestPriceOf(prices: readonly FakePrice[], productId: string): ListPrice | undefined {
  const newest = newestPrice(prices.filter((price) => price.productId === productId));
  return newest && { priceListId: newest.priceListId, unitPrice: newest.unitPrice };
}

export class SequentialIds implements IdGenerator {
  private count = 0;

  next(): string {
    this.count += 1;
    return `id-${this.count}`;
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
