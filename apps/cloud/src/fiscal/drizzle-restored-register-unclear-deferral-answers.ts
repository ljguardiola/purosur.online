import type {
  RecordedUnclearOutcomeOfRegister,
  RestoredRegisterUnclearDeferralAnswers,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fiscalRequests } from "../platform/db/schema.js";
import { answerOf, decisionOf } from "./fiscal-request-answer.js";

export class DrizzleRestoredRegisterUnclearDeferralAnswers<TQueryResult extends PgQueryResultHKT>
  implements RestoredRegisterUnclearDeferralAnswers
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async recordedOutcomesOf(
    registerId: string,
    fiscalDocumentIds: readonly string[],
  ): Promise<RecordedUnclearOutcomeOfRegister[]> {
    const rows = await this.db
      .select()
      .from(fiscalRequests)
      .where(
        and(
          eq(fiscalRequests.registerId, registerId),
          inArray(fiscalRequests.fiscalDocumentId, [...fiscalDocumentIds]),
        ),
      );
    return rows.map((row) => ({
      fiscalDocumentId: row.fiscalDocumentId,
      outcome: { answer: answerOf(row), decision: decisionOf(row) },
      answeredAt: row.answeredAt,
      decidedAt: row.decidedAt,
    }));
  }
}
