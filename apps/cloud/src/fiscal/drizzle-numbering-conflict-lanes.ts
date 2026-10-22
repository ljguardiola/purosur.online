import type {
  AuthorizationNumber,
  NumberingConflictLane,
  NumberingConflictLanes,
  NumberingConflictRequest,
  NumberingDiagnosisRecord,
  NumberingFreeze,
  OrphanRegularization,
  RequestsAtNumber,
  SaleDocument,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq, gt, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  fiscalRequests,
  numberingFreezes,
  taxAuthorityLastAuthorizedNumbers,
} from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { withPendingChanges } from "../sync/change-log.js";
import { DrizzleTaxAuthorityCounts } from "./drizzle-tax-authority-counts.js";
import type { EnqueueCreditNote } from "./enqueue-credit-note.js";
import type { EnqueueNumberingReconciliation } from "./enqueue-numbering-conflict.js";
import { answerOf } from "./fiscal-request-answer.js";
import { diagnosisOf } from "./fiscal-request-diagnosis.js";
import { freezePointOfSaleNumbering } from "./freeze-point-of-sale-numbering.js";
import { otherDocumentsOfSale, requestsAtNumber } from "./orphan-local-standing.js";
import { withPointOfSaleLaneLock } from "./point-of-sale-lane-lock.js";
import { recordOrphanRegularization } from "./record-orphan-regularization.js";

type NumberingReconciliationDocument = Awaited<
  ReturnType<NumberingConflictLane["documentsInNumberingRange"]>
>[number];

type SettlementColumns = Pick<typeof fiscalRequests.$inferSelect, "answerKind" | "decision">;

function settlementOf({
  answerKind,
  decision,
}: SettlementColumns): NumberingReconciliationDocument["settlement"] {
  if (decision === "adopted") {
    return "authorized";
  }
  if (decision === "conflicting") {
    return "conflicting";
  }
  if (decision === "released") {
    return "released_or_rejected";
  }
  if (answerKind === "authorized") {
    return "authorized";
  }
  if (answerKind === "rejected") {
    return "released_or_rejected";
  }
  return "undecided";
}

class DrizzleNumberingConflictLane<TQueryResult extends PgQueryResultHKT>
  implements NumberingConflictLane
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pointOfSale: number;
  private readonly enqueueReconciliation: EnqueueNumberingReconciliation;
  private readonly enqueueCreditNote: EnqueueCreditNote;
  private readonly now: () => Date;

  constructor(
    db: PgDatabase<TQueryResult>,
    pointOfSale: number,
    enqueueReconciliation: EnqueueNumberingReconciliation,
    enqueueCreditNote: EnqueueCreditNote,
    now: () => Date,
  ) {
    this.db = db;
    this.pointOfSale = pointOfSale;
    this.enqueueReconciliation = enqueueReconciliation;
    this.enqueueCreditNote = enqueueCreditNote;
    this.now = now;
  }

  requestsAtNumber(authorization: AuthorizationNumber): Promise<RequestsAtNumber> {
    return requestsAtNumber(this.db, authorization);
  }

  otherDocumentsOfSale(saleId: string, fiscalDocumentId: string): Promise<SaleDocument[]> {
    return otherDocumentsOfSale(this.db, saleId, fiscalDocumentId);
  }

  async numberingConflictRequest(
    fiscalDocumentId: string,
  ): Promise<NumberingConflictRequest | null> {
    const [row] = await this.db
      .select()
      .from(fiscalRequests)
      .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
    if (row === undefined) {
      return null;
    }
    return {
      pointOfSale: row.pointOfSale,
      number: row.number,
      issuedOn: row.issuedOn,
      answer: answerOf(row),
      unclearCodes: row.unclearCodes ?? [],
      diagnosis: diagnosisOf(row.diagnosis),
    };
  }

  async recordNumberingDiagnosis({
    fiscalDocumentId,
    diagnosis,
    diagnosedAt,
    freeze,
  }: NumberingDiagnosisRecord): Promise<void> {
    await withPendingChanges(this.db, undefined, async (tx, pending) => {
      await tx
        .update(fiscalRequests)
        .set({ diagnosis: diagnosis.kind, diagnosedAt })
        .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
      if (freeze === null) {
        return;
      }
      await freezePointOfSaleNumbering(tx, pending, {
        pointOfSale: this.pointOfSale,
        freeze,
        enqueueReconciliation: this.enqueueReconciliation,
      });
    });
  }

  async numberingFreeze(): Promise<NumberingFreeze | null> {
    const [row] = await this.db
      .select({
        countBeforeFreeze: numberingFreezes.countBeforeFreeze,
        frozenAt: numberingFreezes.frozenAt,
      })
      .from(numberingFreezes)
      .where(eq(numberingFreezes.pointOfSaleNumber, this.pointOfSale));
    return row ?? null;
  }

  async taxAuthorityCount(): Promise<number> {
    const [row] = await this.db
      .select({ lastAuthorized: taxAuthorityLastAuthorizedNumbers.lastAuthorized })
      .from(taxAuthorityLastAuthorizedNumbers)
      .where(eq(taxAuthorityLastAuthorizedNumbers.pointOfSaleNumber, this.pointOfSale));
    return row?.lastAuthorized ?? 0;
  }

  async documentsInNumberingRange({
    after,
    through,
  }: {
    after: number;
    through: number;
  }): Promise<NumberingReconciliationDocument[]> {
    const rows = await this.db
      .select({
        number: fiscalRequests.number,
        answerKind: fiscalRequests.answerKind,
        decision: fiscalRequests.decision,
      })
      .from(fiscalRequests)
      .where(
        and(
          eq(fiscalRequests.pointOfSale, this.pointOfSale),
          gt(fiscalRequests.number, after),
          lte(fiscalRequests.number, through),
        ),
      )
      .orderBy(asc(fiscalRequests.number));
    return rows.map((row) => ({ number: row.number, settlement: settlementOf(row) }));
  }

  async settleNumberingReconciliation({
    regularizations,
    lastAuthorized,
  }: {
    regularizations: readonly OrphanRegularization[];
    lastAuthorized: number;
  }): Promise<void> {
    await withPendingChanges(this.db, undefined, async (tx, pending) => {
      for (const regularization of regularizations) {
        await recordOrphanRegularization(tx, regularization, {
          at: this.now(),
          enqueueCreditNote: this.enqueueCreditNote,
        });
      }
      await new DrizzleTaxAuthorityCounts(tx, pending).advance({
        pointOfSale: this.pointOfSale,
        lastAuthorized,
        readAt: this.now(),
      });
      await tx
        .delete(numberingFreezes)
        .where(eq(numberingFreezes.pointOfSaleNumber, this.pointOfSale));
    });
  }
}

export class DrizzleNumberingConflictLanes<TQueryResult extends PgQueryResultHKT>
  implements NumberingConflictLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;
  private readonly enqueueReconciliation: EnqueueNumberingReconciliation;
  private readonly enqueueCreditNote: EnqueueCreditNote;
  private readonly now: () => Date;

  constructor(
    connections: DedicatedConnections<TQueryResult>,
    enqueueReconciliation: EnqueueNumberingReconciliation,
    enqueueCreditNote: EnqueueCreditNote,
    now: () => Date,
  ) {
    this.connections = connections;
    this.enqueueReconciliation = enqueueReconciliation;
    this.enqueueCreditNote = enqueueCreditNote;
    this.now = now;
  }

  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: NumberingConflictLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPointOfSaleLaneLock(this.connections, pointOfSale, (db) =>
      work(
        new DrizzleNumberingConflictLane(
          db,
          pointOfSale,
          this.enqueueReconciliation,
          this.enqueueCreditNote,
          this.now,
        ),
      ),
    );
  }
}
