import {
  type RecordedCreditNote,
  type SaleVoidCreditNoteLane,
  type SaleVoidCreditNoteLanes,
  type SaleVoidCreditNoteRecord,
  VoucherAlreadyCredited,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { creditNotes, pointOfSaleClaims, registerPointsOfSale } from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { creditNoteOf } from "./drizzle-credit-notes.js";
import type { EnqueueCreditNote } from "./enqueue-credit-note.js";
import { withPointOfSaleLaneLock } from "./point-of-sale-lane-lock.js";

const UNIQUE_VIOLATION = "23505";
const CORRECTED_VOUCHER_KEY = "credit_notes_corrected_voucher_key";

class DrizzleSaleVoidCreditNoteLane<TQueryResult extends PgQueryResultHKT>
  implements SaleVoidCreditNoteLane
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

  async registerIssuesFromPointOfSale(registerId: string, pointOfSale: number): Promise<boolean> {
    const [claim] = await this.db
      .select({ registerId: pointOfSaleClaims.registerId })
      .from(pointOfSaleClaims)
      .where(
        and(
          eq(pointOfSaleClaims.registerId, registerId),
          eq(pointOfSaleClaims.pointOfSaleNumber, pointOfSale),
        ),
      );
    return claim !== undefined;
  }

  async recordedCreditNote(creditNoteId: string): Promise<RecordedCreditNote | null> {
    const [row] = await this.db.select().from(creditNotes).where(eq(creditNotes.id, creditNoteId));
    return row === undefined ? null : { registerId: row.registerId, creditNote: creditNoteOf(row) };
  }

  async recordSaleVoidCreditNote(record: SaleVoidCreditNoteRecord): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(creditNotes).values({
          id: record.creditNoteId,
          registerId: record.registerId,
          saleId: record.saleId,
          reason: "sale_void",
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
      if (
        postgresErrorChain(error).some(
          (link) => link.code === UNIQUE_VIOLATION && link.constraint === CORRECTED_VOUCHER_KEY,
        )
      ) {
        throw new VoucherAlreadyCredited();
      }
      throw error;
    }
  }
}

export class DrizzleSaleVoidCreditNoteLanes<TQueryResult extends PgQueryResultHKT>
  implements SaleVoidCreditNoteLanes
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
    work: (lane: SaleVoidCreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPointOfSaleLaneLock(this.connections, pointOfSale, (db) =>
      work(new DrizzleSaleVoidCreditNoteLane(db, this.enqueueCreditNote)),
    );
  }
}
