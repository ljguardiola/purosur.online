import { externalBillingObservation } from "@purosur/domain";
import type {
  ExternalBillingOpening,
  NumberingConflictLane,
  NumberingConflictLanes,
  NumberingConflictRequest,
  NumberingFreeze,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq, gt, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import {
  fiscalRequests,
  numberingFreezes,
  taxAuthorityLastAuthorizedNumbers,
} from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { withPendingChanges } from "../sync/change-log.js";
import { DrizzleTaxAuthorityCounts } from "./drizzle-tax-authority-counts.js";
import type { EnqueueNumberingReconciliation } from "./enqueue-numbering-conflict.js";
import { answerOf } from "./fiscal-request-answer.js";
import { notePointOfSaleHolderChanged } from "./note-point-of-sale-holder-changed.js";
import { withPointOfSaleLaneLock } from "./point-of-sale-lane-lock.js";

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

function diagnosisOf(diagnosis: string | null): NumberingConflictRequest["diagnosis"] {
  switch (diagnosis) {
    case "date_behind":
      return { kind: "date_behind" };
    case "collision":
      return { kind: "collision" };
    default:
      return null;
  }
}

class DrizzleNumberingConflictLane<TQueryResult extends PgQueryResultHKT>
  implements NumberingConflictLane
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pointOfSale: number;
  private readonly enqueueReconciliation: EnqueueNumberingReconciliation;
  private readonly now: () => Date;

  constructor(
    db: PgDatabase<TQueryResult>,
    pointOfSale: number,
    enqueueReconciliation: EnqueueNumberingReconciliation,
    now: () => Date,
  ) {
    this.db = db;
    this.pointOfSale = pointOfSale;
    this.enqueueReconciliation = enqueueReconciliation;
    this.now = now;
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

  async recordNumberingDiagnosis(
    fiscalDocumentId: string,
    diagnosis: NonNullable<NumberingConflictRequest["diagnosis"]>,
    diagnosedAt: Date,
  ): Promise<void> {
    await this.db
      .update(fiscalRequests)
      .set({ diagnosis: diagnosis.kind, diagnosedAt })
      .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
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

  async freezeNumbering({ countBeforeFreeze, frozenAt }: NumberingFreeze): Promise<void> {
    await withPendingChanges(this.db, undefined, async (tx, pending) => {
      await tx
        .insert(numberingFreezes)
        .values({ pointOfSaleNumber: this.pointOfSale, countBeforeFreeze, frozenAt });
      await notePointOfSaleHolderChanged(tx, pending, this.pointOfSale);
    });
  }

  async requestNumberingReconciliation(): Promise<void> {
    await this.db.transaction((tx) => this.enqueueReconciliation(tx, this.pointOfSale));
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

  async openExternalBillingAlert(opening: ExternalBillingOpening): Promise<void> {
    const observation = externalBillingObservation(opening);
    if (!observation.holds) {
      return;
    }
    await this.db.transaction(async (tx) => {
      await openAlert(tx, observation.alert, { now: this.now });
    });
  }

  async continueNumberingAfter(lastAuthorized: number): Promise<void> {
    await new DrizzleTaxAuthorityCounts(this.db).advance({
      pointOfSale: this.pointOfSale,
      lastAuthorized,
      readAt: this.now(),
    });
  }

  async liftNumberingFreeze(): Promise<void> {
    await withPendingChanges(this.db, undefined, async (tx, pending) => {
      await tx
        .delete(numberingFreezes)
        .where(eq(numberingFreezes.pointOfSaleNumber, this.pointOfSale));
      await notePointOfSaleHolderChanged(tx, pending, this.pointOfSale);
    });
  }
}

export class DrizzleNumberingConflictLanes<TQueryResult extends PgQueryResultHKT>
  implements NumberingConflictLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;
  private readonly enqueueReconciliation: EnqueueNumberingReconciliation;
  private readonly now: () => Date;

  constructor(
    connections: DedicatedConnections<TQueryResult>,
    enqueueReconciliation: EnqueueNumberingReconciliation,
    now: () => Date,
  ) {
    this.connections = connections;
    this.enqueueReconciliation = enqueueReconciliation;
    this.now = now;
  }

  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: NumberingConflictLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPointOfSaleLaneLock(this.connections, pointOfSale, (db) =>
      work(new DrizzleNumberingConflictLane(db, pointOfSale, this.enqueueReconciliation, this.now)),
    );
  }
}
