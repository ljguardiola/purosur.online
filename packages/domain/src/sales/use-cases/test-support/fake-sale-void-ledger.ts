import type { FiscalDocumentState } from "../../../fiscal/index.js";
import type { CashMovement } from "../../../register/index.js";
import type { OutboxEventDraft } from "../../../shared/index.js";
import type { SaleWithLines } from "../../model/sale.js";
import type { SaleCashMovement, SaleRefund, SaleStockMovement } from "../sale-ledger.js";
import type { SaleToVoid, SaleVoidLedger, SaleVoidTransaction } from "../void-sale-ports.js";

type StoredSale = SaleWithLines & { voidedAt?: Date; authorizedBy?: string };

interface StoredDeferredRecord {
  saleId: string;
  satisfied: boolean;
  cancelledAt?: Date;
}

type StoredStockMovement = SaleStockMovement & { saleId: string; kind: "sale" | "sale_void" };

export interface FakeSaleVoidLedgerState {
  openSessionId: string | undefined;
  sales: StoredSale[];
  payments: SaleToVoid["payments"];
  fiscalDocuments: { saleId: string; state: FiscalDocumentState }[];
  deferredRecords: StoredDeferredRecord[];
  stockMovements: StoredStockMovement[];
  stockBalances: Record<string, number>;
  refunds: SaleRefund[];
  movements: CashMovement[];
  outbox: OutboxEventDraft[];
  outboxReady: boolean;
}

export type FakeSaleVoidLedgerWrite =
  | "recordVoidedSale"
  | "recordRefund"
  | "recordCashMovement"
  | "recordSaleVoidStockMovement"
  | "addToStockBalance"
  | "cancelDeferredSale"
  | "appendOutboxEvent";

export class FakeSaleVoidLedger implements SaleVoidLedger {
  state: FakeSaleVoidLedgerState;
  transactions = 0;
  failOn: FakeSaleVoidLedgerWrite | undefined;

  constructor(state: Partial<FakeSaleVoidLedgerState> = {}) {
    this.state = {
      openSessionId: undefined,
      sales: [],
      payments: [],
      fiscalDocuments: [],
      deferredRecords: [],
      stockMovements: [],
      stockBalances: {},
      refunds: [],
      movements: [],
      outbox: [],
      outboxReady: true,
      ...state,
    };
  }

  transaction<TOutcome>(work: (tx: SaleVoidTransaction) => TOutcome): TOutcome {
    this.transactions += 1;
    const working = structuredClone(this.state);
    const outcome = work({
      saleToVoid: (saleId) => {
        const sale = working.sales.find((stored) => stored.id === saleId);
        if (sale === undefined) {
          return undefined;
        }
        const record = working.deferredRecords.find((stored) => stored.saleId === saleId);
        return structuredClone({
          sale,
          inOpenSession: sale.sessionId === working.openSessionId,
          payments: working.payments.filter((payment) => payment.saleId === saleId),
          fiscalDocumentStates: working.fiscalDocuments
            .filter((document) => document.saleId === saleId)
            .map(({ state }) => state),
          deferredRecord:
            record === undefined || record.cancelledAt !== undefined
              ? null
              : { satisfied: record.satisfied },
          stockMovements: working.stockMovements
            .filter((movement) => movement.saleId === saleId && movement.kind === "sale")
            .map(({ saleId: _saleId, kind: _kind, ...movement }) => movement),
        });
      },
      saleCashMovements: (saleId) =>
        structuredClone(
          working.movements.filter(
            (movement): movement is SaleCashMovement =>
              movement.ref?.type === "sale" && movement.ref.id === saleId,
          ),
        ),
      outboxReady: () => working.outboxReady,
      recordVoidedSale: (saleId, voidedAt, authorizedBy) => {
        this.failIfAsked("recordVoidedSale");
        for (const sale of working.sales) {
          if (sale.id === saleId) {
            sale.state = "VOIDED";
            sale.voidedAt = voidedAt;
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
      recordCashMovement: (movement) => {
        this.failIfAsked("recordCashMovement");
        working.movements.push(movement);
      },
      recordSaleVoidStockMovement: (movement) => {
        this.failIfAsked("recordSaleVoidStockMovement");
        const saleId = working.sales.find((sale) =>
          sale.lines.some((line) => line.id === movement.saleLineId),
        )?.id;
        working.stockMovements.push({ ...movement, saleId: saleId ?? "", kind: "sale_void" });
      },
      addToStockBalance: (productId, delta) => {
        this.failIfAsked("addToStockBalance");
        working.stockBalances[productId] = (working.stockBalances[productId] ?? 0) + delta;
      },
      cancelDeferredSale: (saleId, cancelledAt) => {
        this.failIfAsked("cancelDeferredSale");
        for (const record of working.deferredRecords) {
          if (record.saleId === saleId) {
            record.cancelledAt = cancelledAt;
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

  private failIfAsked(write: FakeSaleVoidLedgerWrite): void {
    if (this.failOn === write) {
      throw new Error(`${write} failed`);
    }
  }
}
