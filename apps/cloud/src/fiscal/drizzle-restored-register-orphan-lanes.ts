import type {
  AuthorizationNumber,
  NumberingFreeze,
  OrphanRegularization,
  RegisterFiscalPointsOfSale,
  RequestsAtNumber,
  RestoredRegisterOrphanLane,
  RestoredRegisterOrphanLanes,
  SaleDocument,
  UnrecordedSaleRequest,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  fiscalRequests,
  numberingFreezes,
  registerPointsOfSale,
  sales,
} from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import type { EnqueueCreditNote } from "./enqueue-credit-note.js";
import { answerOf, decisionOf } from "./fiscal-request-answer.js";
import { otherDocumentsOfSale, requestsAtNumber } from "./orphan-local-standing.js";
import { withPointOfSaleLaneLock } from "./point-of-sale-lane-lock.js";
import { recordOrphanRegularization } from "./record-orphan-regularization.js";

export class DrizzleRegisterFiscalPointsOfSale<TQueryResult extends PgQueryResultHKT>
  implements RegisterFiscalPointsOfSale
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async fiscalPointsOfSaleOf(registerId: string): Promise<number[]> {
    const rows = await this.db
      .select({ pointOfSale: registerPointsOfSale.pointOfSaleNumber })
      .from(registerPointsOfSale)
      .where(eq(registerPointsOfSale.registerId, registerId));
    return rows.map(({ pointOfSale }) => pointOfSale);
  }
}

class DrizzleRestoredRegisterOrphanLane<TQueryResult extends PgQueryResultHKT>
  implements RestoredRegisterOrphanLane
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pointOfSale: number;
  private readonly enqueueCreditNote: EnqueueCreditNote;
  private readonly now: () => Date;

  constructor(
    db: PgDatabase<TQueryResult>,
    pointOfSale: number,
    enqueueCreditNote: EnqueueCreditNote,
    now: () => Date,
  ) {
    this.db = db;
    this.pointOfSale = pointOfSale;
    this.enqueueCreditNote = enqueueCreditNote;
    this.now = now;
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

  async requestsWithoutRecordedSale(): Promise<UnrecordedSaleRequest[]> {
    const rows = await this.db
      .select({ request: fiscalRequests })
      .from(fiscalRequests)
      .leftJoin(sales, eq(sales.id, fiscalRequests.saleId))
      .where(
        and(
          eq(fiscalRequests.pointOfSale, this.pointOfSale),
          isNull(sales.id),
          or(eq(fiscalRequests.answerKind, "authorized"), eq(fiscalRequests.decision, "adopted")),
        ),
      )
      .orderBy(asc(fiscalRequests.number));
    return rows.map(({ request }) => ({
      fiscalDocumentId: request.fiscalDocumentId,
      saleId: request.saleId,
      number: request.number,
      issuedOn: request.issuedOn,
      total: request.total,
      buyerTaxStatusCode: request.buyerTaxStatusCode,
      outcome: { answer: answerOf(request), decision: decisionOf(request) },
    }));
  }

  requestsAtNumber(authorization: AuthorizationNumber): Promise<RequestsAtNumber> {
    return requestsAtNumber(this.db, authorization);
  }

  otherDocumentsOfSale(saleId: string, fiscalDocumentId: string): Promise<SaleDocument[]> {
    return otherDocumentsOfSale(this.db, saleId, fiscalDocumentId);
  }

  async recordOrphanRegularization(regularization: OrphanRegularization): Promise<void> {
    await this.db.transaction(async (tx) => {
      await recordOrphanRegularization(tx, regularization, {
        at: this.now(),
        enqueueCreditNote: this.enqueueCreditNote,
      });
    });
  }
}

export class DrizzleRestoredRegisterOrphanLanes<TQueryResult extends PgQueryResultHKT>
  implements RestoredRegisterOrphanLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;
  private readonly enqueueCreditNote: EnqueueCreditNote;
  private readonly now: () => Date;

  constructor(
    connections: DedicatedConnections<TQueryResult>,
    enqueueCreditNote: EnqueueCreditNote,
    now: () => Date,
  ) {
    this.connections = connections;
    this.enqueueCreditNote = enqueueCreditNote;
    this.now = now;
  }

  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: RestoredRegisterOrphanLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPointOfSaleLaneLock(this.connections, pointOfSale, (db) =>
      work(
        new DrizzleRestoredRegisterOrphanLane(db, pointOfSale, this.enqueueCreditNote, this.now),
      ),
    );
  }
}
