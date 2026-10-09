import { fiscalRejectionAlertObservation } from "@purosur/domain";
import {
  type AuthorizationRequestRecord,
  FiscalDocumentAlreadyRecorded,
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

const UNIQUE_VIOLATION = "23505";
const FISCAL_REQUESTS_PRIMARY_KEY = "fiscal_requests_pkey";

function pointOfSaleLaneLockKey(pointOfSale: number): string {
  return `fiscal_point_of_sale_lane:${pointOfSale}`;
}

type RecordedAnswerColumns = Pick<
  typeof fiscalRequests.$inferSelect,
  | "answerKind"
  | "authorizationCode"
  | "authorizationCodeDueOn"
  | "rejectionCodes"
  | "rejectionClass"
>;

function answerOf(row: RecordedAnswerColumns): RealTimeAuthorizationAnswer | null {
  switch (row.answerKind) {
    case "authorized":
      return {
        kind: "authorized",
        authorizationCode: row.authorizationCode ?? "",
        authorizationCodeDueOn: row.authorizationCodeDueOn ?? "",
      };
    case "rejected":
      return {
        kind: "rejected",
        codes: row.rejectionCodes ?? [],
        rejectionClass: row.rejectionClass === "standing" ? "standing" : "content",
      };
    case "not_attempted":
      return { kind: "not_attempted" };
    case "unclear":
      return { kind: "unclear" };
    default:
      return null;
  }
}

function answerColumnsOf(answer: RealTimeAuthorizationAnswer) {
  switch (answer.kind) {
    case "authorized":
      return {
        answerKind: answer.kind,
        authorizationCode: answer.authorizationCode,
        authorizationCodeDueOn: answer.authorizationCodeDueOn,
        rejectionCodes: null,
        rejectionClass: null,
      };
    case "rejected":
      return {
        answerKind: answer.kind,
        authorizationCode: null,
        authorizationCodeDueOn: null,
        rejectionCodes: [...answer.codes],
        rejectionClass: answer.rejectionClass,
      };
    case "not_attempted":
    case "unclear":
      return {
        answerKind: answer.kind,
        authorizationCode: null,
        authorizationCodeDueOn: null,
        rejectionCodes: null,
        rejectionClass: null,
      };
  }
}

class DrizzlePointOfSaleLane<TQueryResult extends PgQueryResultHKT> implements PointOfSaleLane {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
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
    try {
      await this.db.insert(fiscalRequests).values(request);
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
  }

  async recordAnswer(
    fiscalDocumentId: string,
    answer: RealTimeAuthorizationAnswer,
    answeredAt: Date,
  ): Promise<void> {
    await this.db
      .update(fiscalRequests)
      .set({ ...answerColumnsOf(answer), answeredAt })
      .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
  }

  async recordTaxAuthorityAnswer(
    fiscalDocumentId: string,
    answer: RealTimeAuthorizationAnswer,
    answeredAt: Date,
    rejectionAlertChange: RejectionAlertChange | null,
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
    });
  }
}

export class DrizzlePointOfSaleLanes<TQueryResult extends PgQueryResultHKT>
  implements PointOfSaleLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;

  constructor(connections: DedicatedConnections<TQueryResult>) {
    this.connections = connections;
  }

  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: PointOfSaleLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.connections.withConnection(async (db) => {
      const key = sql`hashtextextended(${pointOfSaleLaneLockKey(pointOfSale)}, 0)`;
      await db.execute(sql`select pg_advisory_lock(${key})`);
      try {
        return await work(new DrizzlePointOfSaleLane(db));
      } finally {
        await db.execute(sql`select pg_advisory_unlock(${key})`);
      }
    });
  }
}
