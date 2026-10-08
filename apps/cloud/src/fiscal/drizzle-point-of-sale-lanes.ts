import type {
  AuthorizationRequestRecord,
  PointOfSaleLane,
  PointOfSaleLanes,
  RealTimeAuthorizationAnswer,
  RecordedAuthorizationRequest,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fiscalRequests, registerPointsOfSale } from "../platform/db/schema.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";

export function pointOfSaleLaneLockKey(pointOfSale: number): string {
  return `fiscal_point_of_sale_lane:${pointOfSale}`;
}

type RecordedAnswerColumns = Pick<
  typeof fiscalRequests.$inferSelect,
  "answerKind" | "authorizationCode" | "authorizationCodeDueOn" | "rejectionCodes"
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
      return { kind: "rejected", codes: row.rejectionCodes ?? [] };
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
      };
    case "rejected":
      return {
        answerKind: answer.kind,
        authorizationCode: null,
        authorizationCodeDueOn: null,
        rejectionCodes: [...answer.codes],
      };
    case "not_attempted":
    case "unclear":
      return {
        answerKind: answer.kind,
        authorizationCode: null,
        authorizationCodeDueOn: null,
        rejectionCodes: null,
      };
  }
}

// Every write runs in autocommit on the lane's own connection, so a request is committed, and
// visible to every other connection, before the work that follows it starts.
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

  async recordedRequest(fiscalDocumentId: string): Promise<RecordedAuthorizationRequest | null> {
    const [row] = await this.db
      .select({
        answerKind: fiscalRequests.answerKind,
        authorizationCode: fiscalRequests.authorizationCode,
        authorizationCodeDueOn: fiscalRequests.authorizationCodeDueOn,
        rejectionCodes: fiscalRequests.rejectionCodes,
      })
      .from(fiscalRequests)
      .where(eq(fiscalRequests.fiscalDocumentId, fiscalDocumentId));
    return row ? { answer: answerOf(row) } : null;
  }

  async recordRequest(request: AuthorizationRequestRecord): Promise<void> {
    await this.db.insert(fiscalRequests).values(request);
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
