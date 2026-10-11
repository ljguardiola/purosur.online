import {
  type AbandonedRequestRecord,
  FiscalDocumentAlreadyRecorded,
  type RecordedRequestOutcome,
  type UnclearOutcomeDecision,
  type UnclearOutcomeLane,
  type UnclearOutcomeLanes,
  type UnclearOutcomeRequests,
  type UnclearRequest,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { fiscalRequests, registerPointsOfSale } from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import type { EnqueueUnclearOutcome } from "./enqueue-unclear-outcome.js";
import { answerOf } from "./fiscal-request-answer.js";
import { withPointOfSaleLaneLock } from "./point-of-sale-lane-lock.js";

const UNIQUE_VIOLATION = "23505";
const FISCAL_REQUESTS_PRIMARY_KEY = "fiscal_requests_pkey";

type DecisionColumns = Pick<
  typeof fiscalRequests.$inferSelect,
  "decision" | "adoptedAuthorizationCode" | "adoptedAuthorizationCodeDueOn"
>;

function decisionOf(row: DecisionColumns): UnclearOutcomeDecision | null {
  switch (row.decision) {
    case "released":
      return { kind: "released" };
    case "adopted":
      return {
        kind: "adopted",
        authorizationCode: row.adoptedAuthorizationCode ?? "",
        authorizationCodeDueOn: row.adoptedAuthorizationCodeDueOn ?? "",
      };
    case "conflicting":
      return { kind: "conflicting" };
    default:
      return null;
  }
}

function decisionColumnsOf(decision: UnclearOutcomeDecision) {
  return {
    decision: decision.kind,
    adoptedAuthorizationCode: decision.kind === "adopted" ? decision.authorizationCode : null,
    adoptedAuthorizationCodeDueOn:
      decision.kind === "adopted" ? decision.authorizationCodeDueOn : null,
  };
}

class DrizzleUnclearOutcomeLane<TQueryResult extends PgQueryResultHKT>
  implements UnclearOutcomeLane
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly enqueueUnclearOutcome: EnqueueUnclearOutcome;

  constructor(db: PgDatabase<TQueryResult>, enqueueUnclearOutcome: EnqueueUnclearOutcome) {
    this.db = db;
    this.enqueueUnclearOutcome = enqueueUnclearOutcome;
  }

  async unclearRequest(fiscalDocumentId: string): Promise<UnclearRequest | null> {
    const [row] = await this.db
      .select()
      .from(fiscalRequests)
      .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
    if (row === undefined) {
      return null;
    }
    const answer = answerOf(row);
    return {
      fiscalDocumentId,
      pointOfSale: row.pointOfSale,
      number: row.number,
      issuedOn: row.issuedOn,
      total: row.total,
      buyerTaxStatusCode: row.buyerTaxStatusCode,
      progress:
        answer === null || row.answeredAt === null
          ? { kind: "no_answer" }
          : { kind: "answered", answer, answeredAt: row.answeredAt },
      decision: decisionOf(row),
    };
  }

  async recordAbandonment(fiscalDocumentId: string, abandonedAt: Date): Promise<void> {
    await this.db
      .update(fiscalRequests)
      .set({ answerKind: "unclear", answeredAt: abandonedAt })
      .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
  }

  async recordDecision(
    fiscalDocumentId: string,
    decision: UnclearOutcomeDecision,
    decidedAt: Date,
  ): Promise<void> {
    await this.db
      .update(fiscalRequests)
      .set({ ...decisionColumnsOf(decision), decidedAt })
      .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
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
  ): Promise<RecordedRequestOutcome | null> {
    const [row] = await this.db
      .select({
        answerKind: fiscalRequests.answerKind,
        authorizationCode: fiscalRequests.authorizationCode,
        authorizationCodeDueOn: fiscalRequests.authorizationCodeDueOn,
        rejectionCodes: fiscalRequests.rejectionCodes,
        rejectionClass: fiscalRequests.rejectionClass,
        decision: fiscalRequests.decision,
        adoptedAuthorizationCode: fiscalRequests.adoptedAuthorizationCode,
        adoptedAuthorizationCodeDueOn: fiscalRequests.adoptedAuthorizationCodeDueOn,
      })
      .from(fiscalRequests)
      .where(
        and(
          eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId),
          eq(fiscalRequests.registerId, registerId),
        ),
      );
    return row === undefined ? null : { answer: answerOf(row), decision: decisionOf(row) };
  }

  async recordAbandonedRequest(request: AbandonedRequestRecord, abandonedAt: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      try {
        await tx.insert(fiscalRequests).values({
          ...request,
          receivedAt: abandonedAt,
          notAfter: abandonedAt,
          answerKind: "unclear",
          answeredAt: abandonedAt,
        });
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
      await this.enqueueUnclearOutcome(tx, request.fiscalDocumentId, abandonedAt);
    });
  }
}

export class DrizzleUnclearOutcomeLanes<TQueryResult extends PgQueryResultHKT>
  implements UnclearOutcomeLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;
  private readonly enqueueUnclearOutcome: EnqueueUnclearOutcome;

  constructor(
    connections: DedicatedConnections<TQueryResult>,
    enqueueUnclearOutcome: EnqueueUnclearOutcome,
  ) {
    this.connections = connections;
    this.enqueueUnclearOutcome = enqueueUnclearOutcome;
  }

  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: UnclearOutcomeLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPointOfSaleLaneLock(this.connections, pointOfSale, (db) =>
      work(new DrizzleUnclearOutcomeLane(db, this.enqueueUnclearOutcome)),
    );
  }
}

export class DrizzleUnclearOutcomeRequests<TQueryResult extends PgQueryResultHKT>
  implements UnclearOutcomeRequests
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async pointOfSaleOf(fiscalDocumentId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ pointOfSale: fiscalRequests.pointOfSale })
      .from(fiscalRequests)
      .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
    return row?.pointOfSale ?? null;
  }
}
