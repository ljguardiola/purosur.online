import type {
  ArcaCertificateExpiryStore,
  ArcaCertificateExpiryStoreTransaction,
  NewCertificateExpiringAlert,
  OpenCertificateExpiringAlert,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { openAlertCondition } from "../alerts/open-alert-condition.js";
import { resolveAlert } from "../alerts/resolve-alert.js";
import { alerts } from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleArcaCertificateExpiryStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements ArcaCertificateExpiryStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async lockOpenCertificateExpiringAlert(
    environment: string,
  ): Promise<OpenCertificateExpiringAlert | undefined> {
    const [row] = await this.tx
      .select({ alertId: alerts.id, detail: alerts.detail })
      .from(alerts)
      .where(
        and(
          eq(alerts.kind, "arca_certificate_expiring"),
          eq(alerts.scope, environment),
          openAlertCondition(),
        ),
      )
      .for("update");
    if (!row) {
      return undefined;
    }
    const { notAfter } = row.detail as { notAfter: string };
    return { alertId: row.alertId, notAfter: new Date(notAfter) };
  }

  async resolveCertificateExpiringAlert(alertId: string, resolvedAt: Date): Promise<void> {
    await resolveAlert(this.tx, alertId, { now: () => resolvedAt });
  }

  async openCertificateExpiringAlert(alert: NewCertificateExpiringAlert): Promise<void> {
    await openAlert(
      this.tx,
      {
        kind: "arca_certificate_expiring",
        scope: alert.environment,
        detail: { notAfter: alert.notAfter.toISOString() },
      },
      { now: () => alert.openedAt },
    );
  }
}

export class DrizzleArcaCertificateExpiryStore<TQueryResult extends PgQueryResultHKT>
  implements ArcaCertificateExpiryStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: ArcaCertificateExpiryStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleArcaCertificateExpiryStoreTransaction(tx)));
  }
}
