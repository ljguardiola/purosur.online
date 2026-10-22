import type { VoucherReference } from "../../model/orphan-authorization.js";
import type { CreditNote } from "../credit-note-ports.js";
import {
  CreditNoteIdTaken,
  type InvoiceAlreadyCredited,
  type SaleVoidCreditNoteLane,
  type SaleVoidCreditNoteLanes,
  type SaleVoidCreditNoteRecord,
  VoucherAlreadyCredited,
} from "../sale-void-credit-note-ports.js";

export interface FakeRegisterPointsOfSale {
  realTime: number;
  offline?: number;
}

export interface RecordedCreditNote {
  registerId: string;
  creditNote: CreditNote;
}

export interface RaisedInvoiceAlreadyCredited {
  voucher: VoucherReference;
  saleId: string;
  at: Date;
}

export interface KeptAlreadyCreditedRefusal {
  creditNoteId: string;
  registerId: string;
  saleId: string;
  at: Date;
}

export class FakeSaleVoidCreditNoteStore implements SaleVoidCreditNoteLanes {
  readonly operations: string[] = [];
  readonly lanesEntered: number[] = [];
  readonly lookups: { registerId: string; creditNoteId: string }[] = [];
  readonly recorded = new Map<string, RecordedCreditNote>();
  readonly records: SaleVoidCreditNoteRecord[] = [];
  readonly alertsRaised: RaisedInvoiceAlreadyCredited[] = [];
  readonly refusalsKept: KeptAlreadyCreditedRefusal[] = [];
  recordFailure: Error | undefined;
  private readonly registers: Map<string, FakeRegisterPointsOfSale>;

  constructor(registers: Iterable<[string, FakeRegisterPointsOfSale]>) {
    this.registers = new Map(registers);
  }

  seed(registerId: string, creditNote: CreditNote) {
    this.recorded.set(creditNote.creditNoteId, { registerId, creditNote });
  }

  isRealTimeOf(registerId: string, pointOfSale: number): boolean {
    return this.registers.get(registerId)?.realTime === pointOfSale;
  }

  issuesFrom(registerId: string, pointOfSale: number): boolean {
    const register = this.registers.get(registerId);
    return register?.realTime === pointOfSale || register?.offline === pointOfSale;
  }

  async inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: SaleVoidCreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push("enterLane");
    this.lanesEntered.push(pointOfSale);
    try {
      return await work(new FakeSaleVoidCreditNoteLane(this));
    } finally {
      this.operations.push("leaveLane");
    }
  }
}

class FakeSaleVoidCreditNoteLane implements SaleVoidCreditNoteLane {
  private readonly store: FakeSaleVoidCreditNoteStore;

  constructor(store: FakeSaleVoidCreditNoteStore) {
    this.store = store;
  }

  async registerOwnsPointOfSale(registerId: string, pointOfSale: number): Promise<boolean> {
    this.store.operations.push("registerOwnsPointOfSale");
    return this.store.isRealTimeOf(registerId, pointOfSale);
  }

  async registerIssuesFromPointOfSale(registerId: string, pointOfSale: number): Promise<boolean> {
    this.store.operations.push("registerIssuesFromPointOfSale");
    return this.store.issuesFrom(registerId, pointOfSale);
  }

  async recordedCreditNote(registerId: string, creditNoteId: string): Promise<CreditNote | null> {
    this.store.operations.push("recordedCreditNote");
    this.store.lookups.push({ registerId, creditNoteId });
    const recorded = this.store.recorded.get(creditNoteId);
    return recorded === undefined || recorded.registerId !== registerId
      ? null
      : structuredClone(recorded.creditNote);
  }

  async recordSaleVoidCreditNote(record: SaleVoidCreditNoteRecord): Promise<void> {
    this.store.operations.push("recordSaleVoidCreditNote");
    if (this.store.recordFailure !== undefined) {
      throw this.store.recordFailure;
    }
    if (this.store.recorded.has(record.creditNoteId)) {
      throw new CreditNoteIdTaken();
    }
    const { voucherType, pointOfSale, number } = record.correctedVoucher;
    const alreadyCredited = [...this.store.recorded.values()].some(
      ({ creditNote: { associatedVoucher } }) =>
        associatedVoucher.voucherType === voucherType &&
        associatedVoucher.pointOfSale === pointOfSale &&
        associatedVoucher.number === number,
    );
    if (alreadyCredited) {
      throw new VoucherAlreadyCredited();
    }
    this.store.records.push(record);
    this.store.seed(record.registerId, {
      creditNoteId: record.creditNoteId,
      pointOfSale: record.pointOfSale,
      associatedVoucher: record.correctedVoucher,
      total: record.total,
      receiverTaxStatusCode: record.receiverTaxStatusCode,
      reason: "sale_void",
      standing: { kind: "not_requested" },
    });
  }

  async raiseInvoiceAlreadyCredited({ voucher, saleId }: InvoiceAlreadyCredited, at: Date) {
    this.store.operations.push("raiseInvoiceAlreadyCredited");
    this.store.alertsRaised.push({ voucher, saleId, at });
  }

  async keepAlreadyCreditedRefusal(
    refusal: { creditNoteId: string; registerId: string; saleId: string },
    at: Date,
  ) {
    this.store.operations.push("keepAlreadyCreditedRefusal");
    if (
      !this.store.refusalsKept.some(({ creditNoteId }) => creditNoteId === refusal.creditNoteId)
    ) {
      this.store.refusalsKept.push({ ...refusal, at });
    }
  }
}
