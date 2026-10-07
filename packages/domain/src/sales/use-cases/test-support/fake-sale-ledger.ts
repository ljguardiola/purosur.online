import type { RoleAccess } from "../../../access/index.js";
import {
  type BuyerIdentificationThreshold,
  type BuyerTaxStatusOption,
  type IssuerIdentificationInEffect,
  latestBuyerTaxStatusSet,
  latestIssuerIdentification,
} from "../../../fiscal/index.js";
import { priceInEffectAt } from "../../../pricing/index.js";
import type { CashMovement } from "../../../register/index.js";
import type { OutboxEventDraft } from "../../../shared/index.js";
import type { PaymentTransaction } from "../../model/payment.js";
import type { SaleWithLines } from "../../model/sale.js";
import type { ListPrice } from "../../model/sale-line.js";
import type {
  CandidatePromotion,
  Clock,
  IdGenerator,
  RecordedPreEmissionGate,
  RegisterIdentity,
  SaleLedger,
  SaleLedgerTransaction,
  SellableProduct,
  SellingSession,
} from "../sale-ledger.js";

interface FakePrice extends ListPrice {
  id: string;
  productId: string;
  validFrom: Date;
}

type StoredSale = SaleWithLines & { occurredAt?: Date };

export interface FakeSaleLedgerState {
  accesses: Record<string, RoleAccess>;
  identity: RegisterIdentity | undefined;
  revoked: boolean;
  session: SellingSession | undefined;
  products: SellableProduct[];
  barcodes: Record<string, string>;
  prices: FakePrice[];
  thresholds: BuyerIdentificationThreshold[];
  promotionsByProduct: Record<string, CandidatePromotion[]>;
  sales: StoredSale[];
  payments: PaymentTransaction[];
  movements: CashMovement[];
  outbox: OutboxEventDraft[];
  issuerIdentifications: IssuerIdentificationInEffect[];
  buyerTaxStatusSets: { paramsVersion: number; options: BuyerTaxStatusOption[] }[];
  preEmissionGates: RecordedPreEmissionGate[];
}

export type FakeSaleLedgerWrite =
  | "recordOpenedSale"
  | "recordSaleLine"
  | "recordLineQuantity"
  | "deleteSaleLine"
  | "discardOpenSale"
  | "recordPayment"
  | "recordCashMovement"
  | "recordCompletedSale"
  | "recordPreEmissionGate"
  | "appendOutboxEvent";

export class FakeSaleLedger implements SaleLedger {
  state: FakeSaleLedgerState;
  transactions = 0;
  promotionReads = 0;
  barcodeLookups = 0;
  searchableReads = 0;
  failOn: FakeSaleLedgerWrite | undefined;

  constructor(state: Partial<FakeSaleLedgerState> = {}) {
    this.state = {
      accesses: {},
      identity: undefined,
      revoked: false,
      session: undefined,
      products: [],
      barcodes: {},
      prices: [],
      thresholds: [],
      promotionsByProduct: {},
      sales: [],
      payments: [],
      movements: [],
      outbox: [],
      issuerIdentifications: [],
      buyerTaxStatusSets: [],
      preEmissionGates: [],
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
      priceAt: (productId, moment) => latestPriceAt(working.prices, productId, moment),
      promotionsTargeting: (productId) => {
        this.promotionReads += 1;
        return structuredClone(working.promotionsByProduct[productId] ?? []);
      },
      recordOpenedSale: (sale) => {
        this.failIfAsked("recordOpenedSale");
        working.sales.push({ ...sale, lines: [] });
      },
      recordSaleLine: (saleId, line) => {
        this.failIfAsked("recordSaleLine");
        working.sales.find((sale) => sale.id === saleId)?.lines.push(line);
      },
      recordLineQuantity: (line) => {
        this.failIfAsked("recordLineQuantity");
        for (const sale of working.sales) {
          sale.lines = sale.lines.map((stored) =>
            stored.id === line.id
              ? {
                  ...stored,
                  quantity: line.quantity,
                  promotionId: line.promotionId,
                  discountAmount: line.discountAmount,
                  lineTotal: line.lineTotal,
                }
              : stored,
          );
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
      discardOpenSale: (saleId) => {
        this.failIfAsked("discardOpenSale");
        working.sales = working.sales.filter((stored) => stored.id !== saleId);
      },
      recordPayment: (payment) => {
        this.failIfAsked("recordPayment");
        working.payments.push(payment);
      },
      recordCashMovement: (movement) => {
        this.failIfAsked("recordCashMovement");
        working.movements.push(movement);
      },
      recordCompletedSale: (saleId, occurredAt) => {
        this.failIfAsked("recordCompletedSale");
        for (const sale of working.sales) {
          if (sale.id === saleId) {
            sale.state = "COMPLETED";
            sale.occurredAt = occurredAt;
          }
        }
      },
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

function latestPriceAt(
  prices: readonly FakePrice[],
  productId: string,
  moment: Date,
): ListPrice | undefined {
  const inEffect = priceInEffectAt(
    prices.filter((price) => price.productId === productId),
    moment,
  );
  return inEffect && { priceListId: inEffect.priceListId, unitPrice: inEffect.unitPrice };
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
