import { awaitsUnclearOutcomeDecision, fiscalRejectionAlertObservation } from "@purosur/domain";
import {
  type AuthorizationRequestRecord,
  FiscalDocumentAlreadyRecorded,
  type LastAuthorizedCount,
  type PointOfSaleLane,
  type PointOfSaleLanes,
  type RealTimeAuthorizationAnswer,
  type RecordedAuthorizationRequest,
  type RejectionAlertChange,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { observeAlertCondition } from "../alerts/observe-alert-condition.js";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import {
  arcaInvoicingEvidence,
  fiscalRequests,
  registerPointsOfSale,
} from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { PendingChanges } from "../sync/change-log.js";
import { DrizzleTaxAuthorityCounts } from "./drizzle-tax-authority-counts.js";
import type {
  EnqueueUnclearOutcome,
  SqlExecutor,
  WithdrawUnclearOutcome,
} from "./enqueue-unclear-outcome.js";
import { answerColumnsOf, answerOf } from "./fiscal-request-answer.js";
import { withPointOfSaleLaneLock } from "./point-of-sale-lane-lock.js";

const UNIQUE_VIOLATION = "23505";
const FISCAL_REQUESTS_PRIMARY_KEY = "fiscal_requests_pkey";

class DrizzlePointOfSaleLane<TQueryResult extends PgQueryResultHKT> implements PointOfSaleLane {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly enqueueUnclearOutcome: EnqueueUnclearOutcome;
  private readonly withdrawUnclearOutcome: WithdrawUnclearOutcome;

  constructor(
    db: PgDatabase<TQueryResult>,
    enqueueUnclearOutcome: EnqueueUnclearOutcome,
    withdrawUnclearOutcome: WithdrawUnclearOutcome,
  ) {
    this.db = db;
    this.enqueueUnclearOutcome = enqueueUnclearOutcome;
    this.withdrawUnclearOutcome = withdrawUnclearOutcome;
  }

  private async scheduleUnclearOutcome(
    transaction: SqlExecutor,
    fiscalDocumentId: string,
    answer: RealTimeAuthorizationAnswer,
    answeredAt: Date,
  ): Promise<void> {
    if (awaitsUnclearOutcomeDecision(answer)) {
      await this.enqueueUnclearOutcome(transaction, fiscalDocumentId, answeredAt);
    } else {
      await this.withdrawUnclearOutcome(transaction, fiscalDocumentId);
    }
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

  async recordedRequest(
    registerId: string,
    fiscalDocumentId: string,
  ): Promise<RecordedAuthorizationRequest | null> {
    const [row] = await this.db
      .select({
        answerKind: fiscalRequests.answerKind,
        authorizationCode: fiscalRequests.authorizationCode,
        authorizationCodeDueOn: fiscalRequests.authorizationCodeDueOn,
        rejectionCodes: fiscalRequests.rejectionCodes,
        rejectionClass: fiscalRequests.rejectionClass,
      })
      .from(fiscalRequests)
      .where(
        and(
          eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId),
          eq(fiscalRequests.registerId, registerId),
        ),
      );
    return row === undefined ? null : { answer: answerOf(row) };
  }

  async recordRequest(request: AuthorizationRequestRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      try {
        await tx.insert(fiscalRequests).values(request);
      } catch (error) {
        if (
          postgresErrorChain(error).some(
            (link) =>
              link.code === UNIQUE_VIOLATION && link.constraint === FISCAL_REQUESTS_PRIMARY_KEY,
          )
        ) {
          throw new FiscalDocumentAlreadyRecorded();
        }
        throw error;
      }
      await this.enqueueUnclearOutcome(tx, request.fiscalDocumentId, request.notAfter);
    });
  }

  async recordAnswer(
    fiscalDocumentId: string,
    answer: RealTimeAuthorizationAnswer,
    answeredAt: Date,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(fiscalRequests)
        .set({ ...answerColumnsOf(answer), answeredAt })
        .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
      await this.scheduleUnclearOutcome(tx, fiscalDocumentId, answer, answeredAt);
    });
  }

  async recordTaxAuthorityAnswer(
    fiscalDocumentId: string,
    answer: RealTimeAuthorizationAnswer,
    answeredAt: Date,
    rejectionAlertChange: RejectionAlertChange | null,
    taxAuthorityCount: LastAuthorizedCount | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(fiscalRequests)
        .set({ ...answerColumnsOf(answer), answeredAt })
        .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
      await tx
        .insert(arcaInvoicingEvidence)
        .values({ lastCallOkAt: answeredAt })
        .onConflictDoUpdate({
          target: arcaInvoicingEvidence.id,
          set: {
            lastCallOkAt: sql`greatest(${arcaInvoicingEvidence.lastCallOkAt}, excluded.last_call_ok_at)`,
          },
        });
      if (rejectionAlertChange !== null) {
        await observeAlertCondition(tx, fiscalRejectionAlertObservation(rejectionAlertChange), {
          now: () => answeredAt,
        });
      }
      if (taxAuthorityCount !== null) {
        const pending = new PendingChanges();
        await new DrizzleTaxAuthorityCounts(tx, pending).advance(taxAuthorityCount);
        await pending.log(tx);
      }
      await this.scheduleUnclearOutcome(tx, fiscalDocumentId, answer, answeredAt);
    });
  }
}

export class DrizzlePointOfSaleLanes<TQueryResult extends PgQueryResultHKT>
  implements PointOfSaleLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;
  private readonly enqueueUnclearOutcome: EnqueueUnclearOutcome;
  private readonly withdrawUnclearOutcome: WithdrawUnclearOutcome;

  constructor(
    connections: DedicatedConnections<TQueryResult>,
    enqueueUnclearOutcome: EnqueueUnclearOutcome,
    withdrawUnclearOutcome: WithdrawUnclearOutcome,
  ) {
    this.connections = connections;
    this.enqueueUnclearOutcome = enqueueUnclearOutcome;
    this.withdrawUnclearOutcome = withdrawUnclearOutcome;
  }

  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: PointOfSaleLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPointOfSaleLaneLock(this.connections, pointOfSale, (db) =>
      work(new DrizzlePointOfSaleLane(db, this.enqueueUnclearOutcome, this.withdrawUnclearOutcome)),
    );
  }
}
