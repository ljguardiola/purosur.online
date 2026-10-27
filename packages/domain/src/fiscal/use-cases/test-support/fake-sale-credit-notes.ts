import { creditsItsInvoice } from "../../model/credit-note.js";
import type { VoucherReference } from "../../model/orphan-authorization.js";
import {
  CreditNoteIdTaken,
  type InvoiceAlreadyCredited,
  type SaleCreditNoteLane,
  type SaleCreditNoteLanes,
  type SaleCreditNoteRecord,
} from "../accept-sale-credit-note-request-ports.js";
import type { CreditNote } from "../credit-note-ports.js";

function voucherKey({ voucherType, pointOfSale, number }: VoucherReference): string {
  return [voucherType, pointOfSale, number].join("-");
}

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

export class FakeSaleCreditNoteStore implements SaleCreditNoteLanes {
  readonly operations: string[] = [];
  readonly lanesEntered: number[] = [];
  readonly lookups: { registerId: string; creditNoteId: string }[] = [];
  readonly recorded = new Map<string, RecordedCreditNote>();
  readonly records: SaleCreditNoteRecord[] = [];
  readonly alertsRaised: RaisedInvoiceAlreadyCredited[] = [];
  readonly refusalsKept: KeptAlreadyCreditedRefusal[] = [];
  recordFailure: Error | undefined;
  private readonly registers: Map<string, FakeRegisterPointsOfSale>;
  private readonly invoiceTotals: Map<string, number>;

  constructor(
    registers: Iterable<[string, FakeRegisterPointsOfSale]>,
    invoices: Iterable<[VoucherReference, number]> = [],
  ) {
    this.registers = new Map(registers);
    this.invoiceTotals = new Map(
      [...invoices].map(([voucher, total]) => [voucherKey(voucher), total]),
    );
  }

  invoiceTotalOf(voucher: VoucherReference): number | null {
    return this.invoiceTotals.get(voucherKey(voucher)) ?? null;
  }

  creditedTo(voucher: VoucherReference): number {
    return [...this.recorded.values()]
      .filter(
        ({ creditNote }) =>
          voucherKey(creditNote.associatedVoucher) === voucherKey(voucher) &&
          creditsItsInvoice(creditNote.standing.kind),
      )
      .reduce((sum, { creditNote }) => sum + creditNote.total, 0);
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
    work: (lane: SaleCreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push("enterLane");
    this.lanesEntered.push(pointOfSale);
    try {
      return await work(new FakeSaleCreditNoteLane(this));
    } finally {
      this.operations.push("leaveLane");
    }
  }
}

class FakeSaleCreditNoteLane implements SaleCreditNoteLane {
  private readonly store: FakeSaleCreditNoteStore;

  constructor(store: FakeSaleCreditNoteStore) {
    this.store = store;
  }

  async registerOwnsPointOfSale(registerId: string, pointOfSale: number): Promise<boolean> {
    this.store.operations.push("registerOwnsPointOfSale");
    return this.store.isRealTimeOf(registerId, pointOfSale);
  }

  async branchIssuesFromPointOfSale(registerId: string, pointOfSale: number): Promise<boolean> {
    this.store.operations.push("branchIssuesFromPointOfSale");
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

  async recordSaleCreditNote(record: SaleCreditNoteRecord): Promise<void> {
    this.store.operations.push("recordSaleCreditNote");
    if (this.store.recordFailure !== undefined) {
      throw this.store.recordFailure;
    }
    if (this.store.recorded.has(record.creditNoteId)) {
      throw new CreditNoteIdTaken();
    }
    this.store.records.push(record);
    this.store.seed(record.registerId, {
      creditNoteId: record.creditNoteId,
      pointOfSale: record.pointOfSale,
      associatedVoucher: record.correctedVoucher,
      total: record.total,
      receiverTaxStatusCode: record.receiverTaxStatusCode,
      reason: record.origin.kind,
      issueOn: record.origin.kind === "sale_return" ? record.origin.issuedOn : null,
      standing: { kind: "not_requested" },
    });
  }

  async invoiceTotalOf(voucher: VoucherReference): Promise<number | null> {
    this.store.operations.push("invoiceTotalOf");
    return this.store.invoiceTotalOf(voucher);
  }

  async creditedToInvoice(voucher: VoucherReference): Promise<number> {
    this.store.operations.push("creditedToInvoice");
    return this.store.creditedTo(voucher);
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
