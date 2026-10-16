import type {
  CreditNoteAuthorizationRecord,
  CreditNoteRejectionRecord,
  CreditNoteRequestRecord,
  CreditNoteStanding,
  ExternalInvoicingRegularization,
  OrphanCreditNote,
  OrphanCreditNoteLane,
  OrphanCreditNoteLanes,
  OrphanCreditNoteRequests,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { orphanCreditNotes } from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { withPointOfSaleLaneLock } from "./point-of-sale-lane-lock.js";
import { insertFiscalTask, recordExternalInvoicing } from "./record-orphan-regularization.js";

type CreditNoteRow = typeof orphanCreditNotes.$inferSelect;

function standingOf(row: CreditNoteRow): CreditNoteStanding {
  if (row.answerKind === "authorized") {
    return { kind: "authorized" };
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

class DrizzleOrphanCreditNoteLane<TQueryResult extends PgQueryResultHKT>
  implements OrphanCreditNoteLane
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async orphanCreditNote(creditNoteId: string): Promise<OrphanCreditNote | null> {
    const [row] = await this.db
      .select()
      .from(orphanCreditNotes)
      .where(eq(orphanCreditNotes.id, creditNoteId));
    if (row === undefined) {
      return null;
    }
    return {
      creditNoteId,
      pointOfSale: row.pointOfSale,
      associatedVoucher: {
        voucherType: row.associatedVoucherType,
        pointOfSale: row.pointOfSale,
        number: row.associatedNumber,
      },
      total: row.total,
      receiverTaxStatusCode: row.receiverTaxStatusCode,
      standing: standingOf(row),
    };
  }

  async recordCreditNoteRequest({
    creditNoteId,
    number,
    issuedOn,
    requestedAt,
  }: CreditNoteRequestRecord): Promise<void> {
    await this.db
      .update(orphanCreditNotes)
      .set({ ...NO_REQUEST, number, issuedOn, requestedAt })
      .where(eq(orphanCreditNotes.id, creditNoteId));
  }

  async recordCreditNoteAuthorized({
    creditNoteId,
    authorizationCode,
    authorizationCodeDueOn,
    authorizedAt,
  }: CreditNoteAuthorizationRecord): Promise<void> {
    await this.db
      .update(orphanCreditNotes)
      .set({
        answerKind: "authorized",
        answeredAt: authorizedAt,
        authorizationCode,
        authorizationCodeDueOn,
      })
      .where(eq(orphanCreditNotes.id, creditNoteId));
  }

  async recordCreditNoteRejected({
    creditNoteId,
    rejections,
    rejectedAt,
    task,
  }: CreditNoteRejectionRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(orphanCreditNotes)
        .set({
          answerKind: "rejected",
          answeredAt: rejectedAt,
          rejections: rejections.map((rejection) => ({ ...rejection })),
        })
        .where(eq(orphanCreditNotes.id, creditNoteId))
        .returning({ registerId: orphanCreditNotes.registerId });
      if (row === undefined) {
        throw new Error(`no orphan credit note ${creditNoteId}`);
      }
      await insertFiscalTask(tx, task, row.registerId);
    });
  }

  async recordCreditNoteUnclear(creditNoteId: string, answeredAt: Date): Promise<void> {
    await this.db
      .update(orphanCreditNotes)
      .set({ answerKind: "unclear", answeredAt })
      .where(eq(orphanCreditNotes.id, creditNoteId));
  }

  async releaseCreditNoteRequest(
    creditNoteId: string,
    foreignInvoicing: ExternalInvoicingRegularization | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(orphanCreditNotes)
        .set(NO_REQUEST)
        .where(eq(orphanCreditNotes.id, creditNoteId));
      if (foreignInvoicing !== null) {
        await recordExternalInvoicing(tx, foreignInvoicing);
      }
    });
  }
}

export class DrizzleOrphanCreditNoteLanes<TQueryResult extends PgQueryResultHKT>
  implements OrphanCreditNoteLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;

  constructor(connections: DedicatedConnections<TQueryResult>) {
    this.connections = connections;
  }

  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: OrphanCreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPointOfSaleLaneLock(this.connections, pointOfSale, (db) =>
      work(new DrizzleOrphanCreditNoteLane(db)),
    );
  }
}

export class DrizzleOrphanCreditNoteRequests<TQueryResult extends PgQueryResultHKT>
  implements OrphanCreditNoteRequests
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async pointOfSaleOf(creditNoteId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ pointOfSale: orphanCreditNotes.pointOfSale })
      .from(orphanCreditNotes)
      .where(eq(orphanCreditNotes.id, creditNoteId));
    return row?.pointOfSale ?? null;
  }
}
