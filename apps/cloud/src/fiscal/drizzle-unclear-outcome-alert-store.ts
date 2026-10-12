import { type AlertLevel, UNCLEAR_ANSWER_KINDS, unclearOutcomeSince } from "@purosur/domain";
import type {
  UnclearDocumentWithoutAlert,
  UnclearOutcomeAlertStore,
  UnclearOutcomeAlertTransaction,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { openAlertCondition } from "../alerts/open-alert-condition.js";
import { alerts, fiscalRequests } from "../platform/db/schema.js";
import { answerOf } from "./fiscal-request-answer.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleUnclearOutcomeAlertTransaction<TQueryResult extends PgQueryResultHKT>
  implements UnclearOutcomeAlertTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async lockUnclearDocumentsWithoutUnclearOutcomeAlert(): Promise<UnclearDocumentWithoutAlert[]> {
    const rows = await this.tx
      .select()
      .from(fiscalRequests)
      .where(
        and(
          isNull(fiscalRequests.decision),
          or(
            isNull(fiscalRequests.answerKind),
            inArray(fiscalRequests.answerKind, [...UNCLEAR_ANSWER_KINDS]),
          ),
          notExists(
            this.tx
              .select({ id: alerts.id })
              .from(alerts)
              .where(
                and(
                  eq(alerts.kind, "fiscal_unknown"),
                  sql`${alerts.scope} = ${fiscalRequests.fiscalDocumentId}::text`,
                  openAlertCondition(),
                ),
              ),
          ),
        ),
      )
      .for("update", { of: fiscalRequests, skipLocked: true });
    return rows.flatMap((row) => {
      const answer = answerOf(row);
      const unclearSince = unclearOutcomeSince({
        answer,
        answeredAt: row.answeredAt,
        notAfter: row.notAfter,
        decision: null,
      });
      return unclearSince === null
        ? []
        : [
            {
              fiscalDocumentId: row.fiscalDocumentId,
              saleId: row.saleId,
              registerId: row.registerId,
              pointOfSale: row.pointOfSale,
              number: row.number,
              unclearSince,
            },
          ];
    });
  }

  async openUnclearOutcomeAlert(
    document: UnclearDocumentWithoutAlert,
    level: AlertLevel,
    openedAt: Date,
  ): Promise<void> {
    await openAlert(
      this.tx,
      {
        kind: "fiscal_unknown",
        scope: document.fiscalDocumentId,
        detail: {
          fiscalDocumentId: document.fiscalDocumentId,
          saleId: document.saleId,
          registerId: document.registerId,
          pointOfSale: document.pointOfSale,
          number: document.number,
          unclearSince: document.unclearSince.toISOString(),
        },
      },
      { now: () => openedAt, level },
    );
  }
}

export class DrizzleUnclearOutcomeAlertStore<TQueryResult extends PgQueryResultHKT>
  implements UnclearOutcomeAlertStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: UnclearOutcomeAlertTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleUnclearOutcomeAlertTransaction(tx)));
  }
}
