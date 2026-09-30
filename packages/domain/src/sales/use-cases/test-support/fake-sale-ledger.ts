import type { RoleAccess } from "../../../access/index.js";
import type { CashMovement } from "../../../register/index.js";
import type { OutboxEventDraft } from "../../../sync/index.js";
import type { PaymentTransaction } from "../../model/payment.js";
import type { SaleWithLines } from "../../model/sale.js";
import type { ListPrice } from "../../model/sale-line.js";
import type {
  Clock,
  IdGenerator,
  RegisterIdentity,
  SaleLedger,
  SaleLedgerTransaction,
  ScannedProduct,
  SellingSession,
} from "../sale-ledger.js";

interface FakePrice extends ListPrice {
  productId: string;
  validFrom: Date;
}

export interface FakeSaleLedgerState {
  accesses: Record<string, RoleAccess>;
  identity: RegisterIdentity | undefined;
  revoked: boolean;
  session: SellingSession | undefined;
  products: ScannedProduct[];
  barcodes: Record<string, string>;
  prices: FakePrice[];
  sales: SaleWithLines[];
  payments: PaymentTransaction[];
  movements: CashMovement[];
  outbox: OutboxEventDraft[];
}

export type FakeSaleLedgerWrite =
  | "recordOpenedSale"
  | "recordSaleLine"
  | "recordLineQuantity"
  | "recordPayment"
  | "recordCashMovement"
  | "recordCompletedSale"
  | "appendOutboxEvent";

export class FakeSaleLedger implements SaleLedger {
  state: FakeSaleLedgerState;
  transactions = 0;
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
      sales: [],
      payments: [],
      movements: [],
      outbox: [],
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
      activeProductByBarcode: (code) =>
        working.products.find((product) => product.id === working.barcodes[code]),
      priceAt: (productId, moment) => latestPriceAt(working.prices, productId, moment),
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
              ? { ...stored, quantity: line.quantity, lineTotal: line.lineTotal }
              : stored,
          );
        }
      },
      recordPayment: (payment) => {
        this.failIfAsked("recordPayment");
        working.payments.push(payment);
      },
      recordCashMovement: (movement) => {
        this.failIfAsked("recordCashMovement");
        working.movements.push(movement);
      },
      recordCompletedSale: (saleId) => {
        this.failIfAsked("recordCompletedSale");
        for (const sale of working.sales) {
          if (sale.id === saleId) {
            sale.state = "COMPLETED";
          }
        }
      },
      appendOutboxEvent: (draft) => {
        this.failIfAsked("appendOutboxEvent");
        working.outbox.push(draft);
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

function latestPriceAt(
  prices: readonly FakePrice[],
  productId: string,
  moment: Date,
): ListPrice | undefined {
  const valid = prices
    .filter((price) => price.productId === productId && price.validFrom <= moment)
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
  const latest = valid[0];
  return latest && { priceListId: latest.priceListId, unitPrice: latest.unitPrice };
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
