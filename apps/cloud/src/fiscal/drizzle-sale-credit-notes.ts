import { creditWithinInvoice, invoiceAlreadyCreditedObservation } from "@purosur/domain";
import {
  type AlreadyCreditedRefusal,
  type CreditNote,
  CreditNoteIdTaken,
  type InvoiceAlreadyCredited,
  type SaleCreditNoteLane,
  type SaleCreditNoteLanes,
  type SaleCreditNoteRecord,
  VoucherAlreadyCredited,
  type VoucherReference,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import { alias, type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import {
  creditNotes,
  pointOfSaleClaims,
  registerPointsOfSale,
  registers,
  saleCreditNoteRefusals,
} from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import {
  invoiceTotalHeld,
  lockCreditedVoucher,
  totalCreditedToInvoice,
} from "./credited-voucher.js";
import { creditNoteOf } from "./drizzle-credit-notes.js";
import type { EnqueueCreditNote } from "./enqueue-credit-note.js";
import { withPointOfSaleLaneLock } from "./point-of-sale-lane-lock.js";

const UNIQUE_VIOLATION = "23505";
const PRIMARY_KEY = "credit_notes_pkey";

class DrizzleSaleCreditNoteLane<TQueryResult extends PgQueryResultHKT>
  implements SaleCreditNoteLane
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly enqueueCreditNote: EnqueueCreditNote;

  constructor(db: PgDatabase<TQueryResult>, enqueueCreditNote: EnqueueCreditNote) {
    this.db = db;
    this.enqueueCreditNote = enqueueCreditNote;
  }

  async registerOwnsPointOfSale(registerId: string, pointOfSale: number): Promise<boolean> {
    const [current] = await this.db
      .select({ registerId: registerPointsOfSale.registerId })
      .from(registerPointsOfSale)
      .where(
        and(
          eq(registerPointsOfSale.registerId, registerId),
          eq(registerPointsOfSale.pointOfSaleNumber, pointOfSale),
        ),
      );
    return current !== undefined;
  }

  async branchIssuesFromPointOfSale(registerId: string, pointOfSale: number): Promise<boolean> {
    const requesting = alias(registers, "requesting_register");
    const [claim] = await this.db
      .select({ registerId: pointOfSaleClaims.registerId })
      .from(pointOfSaleClaims)
      .innerJoin(registers, eq(registers.id, pointOfSaleClaims.registerId))
      .innerJoin(requesting, eq(requesting.locationId, registers.locationId))
      .where(
        and(eq(requesting.id, registerId), eq(pointOfSaleClaims.pointOfSaleNumber, pointOfSale)),
      );
    return claim !== undefined;
  }

  async recordedCreditNote(registerId: string, creditNoteId: string): Promise<CreditNote | null> {
    const [row] = await this.db
      .select()
      .from(creditNotes)
      .where(and(eq(creditNotes.id, creditNoteId), eq(creditNotes.registerId, registerId)));
    return row === undefined ? null : creditNoteOf(row);
  }

  invoiceTotalOf(voucher: VoucherReference): Promise<number | null> {
    return invoiceTotalHeld(this.db, voucher);
  }

  creditedToInvoice(voucher: VoucherReference): Promise<number> {
    return totalCreditedToInvoice(this.db, voucher);
  }

  async recordSaleCreditNote(record: SaleCreditNoteRecord): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await lockCreditedVoucher(tx, record.correctedVoucher);
        const withinInvoice = creditWithinInvoice({
          invoiceTotal: await invoiceTotalHeld(tx, record.correctedVoucher),
          alreadyCredited: await totalCreditedToInvoice(tx, record.correctedVoucher),
          asked: record.total,
        });
        if (!withinInvoice) {
          throw new VoucherAlreadyCredited();
        }
        await tx.insert(creditNotes).values({
          id: record.creditNoteId,
          registerId: record.registerId,
          saleId: record.saleId,
          reason: record.origin.kind,
          ...(record.origin.kind === "sale_return"
            ? { returnId: record.origin.returnId, issueOn: record.origin.issuedOn }
            : {}),
          pointOfSale: record.pointOfSale,
          associatedVoucherType: record.correctedVoucher.voucherType,
          associatedPointOfSale: record.correctedVoucher.pointOfSale,
          associatedNumber: record.correctedVoucher.number,
          total: record.total,
          receiverTaxStatusCode: record.receiverTaxStatusCode,
          createdAt: record.receivedAt,
        });
        await this.enqueueCreditNote(tx, record.creditNoteId);
      });
    } catch (error) {
      const violated = postgresErrorChain(error).find((link) => link.code === UNIQUE_VIOLATION);
      if (violated?.constraint === PRIMARY_KEY) {
        throw new CreditNoteIdTaken();
      }
      throw error;
    }
  }

  async raiseInvoiceAlreadyCredited(
    { voucher, saleId }: InvoiceAlreadyCredited,
    at: Date,
  ): Promise<void> {
    const observation = invoiceAlreadyCreditedObservation({
      pointOfSale: voucher.pointOfSale,
      number: voucher.number,
      saleId,
    });
    if (observation.holds) {
      await openAlert(this.db, observation.alert, { now: () => at });
    }
  }

  async keepAlreadyCreditedRefusal(refusal: AlreadyCreditedRefusal, at: Date): Promise<void> {
    await this.db
      .insert(saleCreditNoteRefusals)
      .values({ ...refusal, refusedAt: at })
      .onConflictDoNothing();
  }
}

export class DrizzleSaleCreditNoteLanes<TQueryResult extends PgQueryResultHKT>
  implements SaleCreditNoteLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;
  private readonly enqueueCreditNote: EnqueueCreditNote;

  constructor(
    connections: DedicatedConnections<TQueryResult>,
    enqueueCreditNote: EnqueueCreditNote,
  ) {
    this.connections = connections;
    this.enqueueCreditNote = enqueueCreditNote;
  }

  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: SaleCreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPointOfSaleLaneLock(this.connections, pointOfSale, (db) =>
      work(new DrizzleSaleCreditNoteLane(db, this.enqueueCreditNote)),
    );
  }
}
