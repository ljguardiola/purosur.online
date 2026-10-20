import {
  type CreditNote,
  type CreditNoteAuthorizationRecord,
  type CreditNoteLane,
  type CreditNoteLanes,
  CreditNoteNumberTaken,
  type CreditNoteRejectionRecord,
  type CreditNoteRequestRecord,
  type CreditNoteRequests,
  type CreditNoteStanding,
  type ExternalInvoicingRegularization,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, ne } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { creditNotes } from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { withPointOfSaleLaneLock } from "./point-of-sale-lane-lock.js";
import { insertFiscalTask, recordExternalInvoicing } from "./record-orphan-regularization.js";

const UNIQUE_VIOLATION = "23505";
const CREDIT_NOTE_NUMBER_KEY = "credit_notes_number_key";

export type CreditNoteRow = typeof creditNotes.$inferSelect;

export function standingOf(row: CreditNoteRow): CreditNoteStanding {
  if (row.answerKind === "authorized") {
    if (
      row.number === null ||
      row.issuedOn === null ||
      row.requestedAt === null ||
      row.authorizationCode === null ||
      row.authorizationCodeDueOn === null
    ) {
      throw new Error(`credit note ${row.id} is authorized without its authorization`);
    }
    return {
      kind: "authorized",
      number: row.number,
      issuedOn: row.issuedOn,
      requestedAt: row.requestedAt,
      authorizationCode: row.authorizationCode,
      authorizationCodeDueOn: row.authorizationCodeDueOn,
    };
  }
  if (row.answerKind === "rejected") {
    return { kind: "rejected" };
  }
  if (row.number === null || row.issuedOn === null || row.requestedAt === null) {
    return { kind: "not_requested" };
  }
  return {
    kind: "requested",
    number: row.number,
    issuedOn: row.issuedOn,
    requestedAt: row.requestedAt,
    unclearAnsweredAt: row.answerKind === "unclear" ? row.answeredAt : null,
  };
}

export function creditNoteOf(row: CreditNoteRow): CreditNote {
  return {
    creditNoteId: row.id,
    pointOfSale: row.pointOfSale,
    associatedVoucher: {
      voucherType: row.associatedVoucherType,
      pointOfSale: row.associatedPointOfSale,
      number: row.associatedNumber,
    },
    total: row.total,
    receiverTaxStatusCode: row.receiverTaxStatusCode,
    reason: row.reason,
    standing: standingOf(row),
  };
}

const NO_REQUEST = {
  number: null,
  issuedOn: null,
  requestedAt: null,
  answerKind: null,
  answeredAt: null,
  authorizationCode: null,
  authorizationCodeDueOn: null,
  rejections: null,
};

class DrizzleCreditNoteLane<TQueryResult extends PgQueryResultHKT> implements CreditNoteLane {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pointOfSale: number;

  constructor(db: PgDatabase<TQueryResult>, pointOfSale: number) {
    this.db = db;
    this.pointOfSale = pointOfSale;
  }

  async creditNote(creditNoteId: string): Promise<CreditNote | null> {
    const [row] = await this.db.select().from(creditNotes).where(eq(creditNotes.id, creditNoteId));
    return row === undefined ? null : creditNoteOf(row);
  }

  async otherCreditNoteStandings(creditNoteId: string): Promise<CreditNoteStanding[]> {
    const rows = await this.db
      .select()
      .from(creditNotes)
      .where(and(eq(creditNotes.pointOfSale, this.pointOfSale), ne(creditNotes.id, creditNoteId)));
    return rows.map(standingOf);
  }

  async recordCreditNoteRequest({
    creditNoteId,
    number,
    issuedOn,
    requestedAt,
  }: CreditNoteRequestRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      try {
        await tx
          .update(creditNotes)
          .set({ ...NO_REQUEST, number, issuedOn, requestedAt })
          .where(eq(creditNotes.id, creditNoteId));
      } catch (error) {
        if (
          postgresErrorChain(error).some(
            (link) => link.code === UNIQUE_VIOLATION && link.constraint === CREDIT_NOTE_NUMBER_KEY,
          )
        ) {
          throw new CreditNoteNumberTaken();
        }
        throw error;
      }
    });
  }

  async recordCreditNoteAuthorized({
    creditNoteId,
    authorizationCode,
    authorizationCodeDueOn,
    authorizedAt,
  }: CreditNoteAuthorizationRecord): Promise<void> {
    await this.db
      .update(creditNotes)
      .set({
        answerKind: "authorized",
        answeredAt: authorizedAt,
        authorizationCode,
        authorizationCodeDueOn,
      })
      .where(eq(creditNotes.id, creditNoteId));
  }

  async recordCreditNoteRejected({
    creditNoteId,
    rejections,
    rejectedAt,
    task,
  }: CreditNoteRejectionRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(creditNotes)
        .set({
          answerKind: "rejected",
          answeredAt: rejectedAt,
          rejections: rejections.map((rejection) => ({ ...rejection })),
        })
        .where(eq(creditNotes.id, creditNoteId))
        .returning({ registerId: creditNotes.registerId });
      if (row === undefined) {
        throw new Error(`no orphan credit note ${creditNoteId}`);
      }
      await insertFiscalTask(tx, task, row.registerId);
    });
  }

  async recordCreditNoteUnclear(creditNoteId: string, answeredAt: Date): Promise<void> {
    await this.db
      .update(creditNotes)
      .set({ answerKind: "unclear", answeredAt })
      .where(eq(creditNotes.id, creditNoteId));
  }

  async releaseCreditNoteRequest(
    creditNoteId: string,
    foreignInvoicing: ExternalInvoicingRegularization | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(creditNotes).set(NO_REQUEST).where(eq(creditNotes.id, creditNoteId));
      if (foreignInvoicing !== null) {
        await recordExternalInvoicing(tx, foreignInvoicing);
      }
    });
  }
}

export class DrizzleCreditNoteLanes<TQueryResult extends PgQueryResultHKT>
  implements CreditNoteLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;

  constructor(connections: DedicatedConnections<TQueryResult>) {
    this.connections = connections;
  }

  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: CreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPointOfSaleLaneLock(this.connections, pointOfSale, (db) =>
      work(new DrizzleCreditNoteLane(db, pointOfSale)),
    );
  }
}

export class DrizzleCreditNoteRequests<TQueryResult extends PgQueryResultHKT>
  implements CreditNoteRequests
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async pointOfSaleOf(creditNoteId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ pointOfSale: creditNotes.pointOfSale })
      .from(creditNotes)
      .where(eq(creditNotes.id, creditNoteId));
    return row?.pointOfSale ?? null;
  }
}
