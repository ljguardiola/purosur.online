import type {
  WsaaToken,
  WsaaTokenAnswer,
  WsaaTokenRenewal,
  WsaaTokenStore,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { openAlertCondition } from "../alerts/open-alert-condition.js";
import { resolveAlert } from "../alerts/resolve-alert.js";
import { alerts, arcaWsaaTicketRefusals, arcaWsaaTokens } from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

export type ResumeWorkWaitingOnToken = (transaction: {
  execute(query: SQL): PromiseLike<unknown>;
}) => Promise<void>;

export interface DrizzleWsaaTokenStoreOptions {
  environment: string;
  resumeWorkWaitingOnToken?: ResumeWorkWaitingOnToken;
}

class DrizzleWsaaTokenAnswer<TQueryResult extends PgQueryResultHKT> implements WsaaTokenAnswer {
  private readonly tx: Transaction<TQueryResult>;
  private readonly service: string;
  private readonly certificateFingerprint: string;
  private readonly options: DrizzleWsaaTokenStoreOptions;

  constructor(
    tx: Transaction<TQueryResult>,
    service: string,
    certificateFingerprint: string,
    options: DrizzleWsaaTokenStoreOptions,
  ) {
    this.tx = tx;
    this.service = service;
    this.certificateFingerprint = certificateFingerprint;
    this.options = options;
  }

  async recordIssuedToken({ token, sign, issuedAt, expiresAt }: WsaaToken): Promise<void> {
    await this.tx
      .insert(arcaWsaaTokens)
      .values({
        service: this.service,
        certificateFingerprint: this.certificateFingerprint,
        token,
        sign,
        issuedAt,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [arcaWsaaTokens.service, arcaWsaaTokens.certificateFingerprint],
        set: { token, sign, issuedAt, expiresAt },
      });
  }

  async clearRefusal(): Promise<void> {
    await this.tx
      .delete(arcaWsaaTicketRefusals)
      .where(
        and(
          eq(arcaWsaaTicketRefusals.service, this.service),
          eq(arcaWsaaTicketRefusals.certificateFingerprint, this.certificateFingerprint),
        ),
      );
  }

  async resolveHeldTicketAlert(resolvedAt: Date): Promise<void> {
    const [open] = await this.tx
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.kind, "arca_wsaa_ticket_held"),
          eq(alerts.scope, this.options.environment),
          openAlertCondition(),
        ),
      )
      .for("update");
    if (open) {
      await resolveAlert(this.tx, open.id, { now: () => resolvedAt });
    }
  }

  async resumeWorkWaitingOnToken(): Promise<void> {
    await this.options.resumeWorkWaitingOnToken?.(this.tx);
  }

  async recordRefusal(refusedAt: Date): Promise<void> {
    await this.tx
      .insert(arcaWsaaTicketRefusals)
      .values({
        service: this.service,
        certificateFingerprint: this.certificateFingerprint,
        refusedAt,
      })
      .onConflictDoUpdate({
        target: [arcaWsaaTicketRefusals.service, arcaWsaaTicketRefusals.certificateFingerprint],
        set: { refusedAt },
      });
  }

  async openHeldTicketAlert(openedAt: Date): Promise<void> {
    await openAlert(
      this.tx,
      { kind: "arca_wsaa_ticket_held", scope: this.options.environment, detail: {} },
      { now: () => openedAt },
    );
  }
}

export function wsaaTokenLockKey(service: string, certificateFingerprint: string): string {
  return `wsaa_token:${service}:${certificateFingerprint}`;
}

class DrizzleWsaaTokenRenewal<TQueryResult extends PgQueryResultHKT> implements WsaaTokenRenewal {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly service: string;
  private readonly certificateFingerprint: string;
  private readonly options: DrizzleWsaaTokenStoreOptions;

  constructor(
    db: PgDatabase<TQueryResult>,
    service: string,
    certificateFingerprint: string,
    options: DrizzleWsaaTokenStoreOptions,
  ) {
    this.db = db;
    this.service = service;
    this.certificateFingerprint = certificateFingerprint;
    this.options = options;
  }

  async persistedToken(): Promise<WsaaToken | null> {
    const [row] = await this.db
      .select({
        token: arcaWsaaTokens.token,
        sign: arcaWsaaTokens.sign,
        issuedAt: arcaWsaaTokens.issuedAt,
        expiresAt: arcaWsaaTokens.expiresAt,
      })
      .from(arcaWsaaTokens)
      .where(
        and(
          eq(arcaWsaaTokens.service, this.service),
          eq(arcaWsaaTokens.certificateFingerprint, this.certificateFingerprint),
        ),
      );
    return row ?? null;
  }

  async lastRefusal(): Promise<Date | null> {
    const [row] = await this.db
      .select({ refusedAt: arcaWsaaTicketRefusals.refusedAt })
      .from(arcaWsaaTicketRefusals)
      .where(
        and(
          eq(arcaWsaaTicketRefusals.service, this.service),
          eq(arcaWsaaTicketRefusals.certificateFingerprint, this.certificateFingerprint),
        ),
      );
    return row?.refusedAt ?? null;
  }

  recordAnswer<TOutcome>(work: (answer: WsaaTokenAnswer) => Promise<TOutcome>): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleWsaaTokenAnswer(tx, this.service, this.certificateFingerprint, this.options)),
    );
  }
}

// The renewal holds a session-level advisory lock across the call to WSAA and the transaction that
// records its answer, so the database handle must be bound to one connection for the whole
// renewal: the lock and its release have to run on the connection that took it.
export class DrizzleWsaaTokenStore<TQueryResult extends PgQueryResultHKT>
  implements WsaaTokenStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly options: DrizzleWsaaTokenStoreOptions;

  constructor(db: PgDatabase<TQueryResult>, options: DrizzleWsaaTokenStoreOptions) {
    this.db = db;
    this.options = options;
  }

  async holdRenewal<TOutcome>(
    service: string,
    certificateFingerprint: string,
    work: (renewal: WsaaTokenRenewal) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const key = sql`hashtextextended(${wsaaTokenLockKey(service, certificateFingerprint)}, 0)`;
    await this.db.execute(sql`select pg_advisory_lock(${key})`);
    try {
      return await work(
        new DrizzleWsaaTokenRenewal(this.db, service, certificateFingerprint, this.options),
      );
    } finally {
      await this.db.execute(sql`select pg_advisory_unlock(${key})`);
    }
  }
}
