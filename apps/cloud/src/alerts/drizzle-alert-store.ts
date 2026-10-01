import { type AlertKind, isAlertKind } from "@purosur/domain";
import {
  AlertAlreadyOpenError,
  type AlertClosure,
  type AlertEscalation,
  type AlertRecipientCandidate,
  type AlertStore,
  type AlertStoreTransaction,
  type LockedAlert,
  type LockedOpenAlert,
  type NewAlert,
} from "@purosur/domain/alerts/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import {
  alertDeliveries,
  alerts,
  auditLog,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { openAlertCondition } from "./open-alert-condition.js";

const UNIQUE_VIOLATION = "23505";
const ALERT_OPEN_DEDUP_UNIQUE_INDEX = "alerts_open_dedup_key";

function isAlertOpenDedupViolation(error: unknown): boolean {
  return postgresErrorChain(error).some(
    ({ code, constraint }) =>
      code === UNIQUE_VIOLATION && constraint === ALERT_OPEN_DEDUP_UNIQUE_INDEX,
  );
}

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleAlertStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements AlertStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async insertAlert(alert: NewAlert): Promise<string> {
    try {
      // A savepoint, so a lost dedup race leaves the rest of the transaction usable.
      const [row] = await this.tx.transaction((savepoint) =>
        savepoint
          .insert(alerts)
          .values({ ...alert, detail: { ...alert.detail } })
          .returning({ id: alerts.id }),
      );
      if (!row) {
        throw new Error("inserting the alert returned no row");
      }
      return row.id;
    } catch (error) {
      if (isAlertOpenDedupViolation(error)) {
        throw new AlertAlreadyOpenError(alert.kind, alert.scope);
      }
      throw error;
    }
  }

  async findOpenAlertId(kind: AlertKind, scope: string): Promise<string | undefined> {
    const [row] = await this.tx
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(eq(alerts.kind, kind), eq(alerts.scope, scope), openAlertCondition()));
    return row?.id;
  }

  async listActiveAlertViewers(): Promise<AlertRecipientCandidate[]> {
    const rows = await this.tx
      .select({
        userId: users.id,
        locationId: users.locationId,
        roleId: roles.id,
        isAdministrator: roles.isAdministrator,
      })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(users.active, true));
    if (rows.length === 0) {
      return [];
    }
    const permissionRows = await this.tx
      .select({ roleId: rolePermissions.roleId, permissionKey: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(
        inArray(
          rolePermissions.roleId,
          rows.map((row) => row.roleId),
        ),
      );

    const viewers = new Map<string, AlertRecipientCandidate>();
    for (const row of rows) {
      const permissionKeys = permissionRows
        .filter((permission) => permission.roleId === row.roleId)
        .map((permission) => permission.permissionKey);
      const existing = viewers.get(row.userId);
      viewers.set(row.userId, {
        userId: row.userId,
        locationId: row.locationId,
        isAdministrator: (existing?.isAdministrator ?? false) || row.isAdministrator,
        permissionKeys: [...new Set([...(existing?.permissionKeys ?? []), ...permissionKeys])],
      });
    }
    return [...viewers.values()];
  }

  async recordBackofficeDeliveries(
    alertId: string,
    recipientUserIds: readonly string[],
  ): Promise<void> {
    await this.tx.insert(alertDeliveries).values(
      recipientUserIds.map((recipientUserId) => ({
        alertId,
        recipientUserId,
        channel: "backoffice" as const,
        status: "sent" as const,
      })),
    );
  }

  async lockAlert(alertId: string): Promise<LockedAlert | undefined> {
    const [row] = await this.tx
      .select({
        kind: alerts.kind,
        level: alerts.level,
        escalatedAt: alerts.escalatedAt,
        scope: alerts.scope,
        detail: alerts.detail,
        resolvedAt: alerts.resolvedAt,
      })
      .from(alerts)
      .where(eq(alerts.id, alertId))
      .for("update");
    if (!row) {
      return undefined;
    }
    if (!isAlertKind(row.kind)) {
      throw new Error(`alert ${alertId} has a kind outside the catalog: ${row.kind}`);
    }
    return { ...row, kind: row.kind };
  }

  async recordClosure(alertId: string, closure: AlertClosure): Promise<void> {
    await this.tx
      .update(alerts)
      .set({
        resolvedAt: closure.closedAt,
        resolvedBy: closure.closedBy,
        scope: closure.scope,
        detail: closure.detail,
      })
      .where(eq(alerts.id, alertId));
    await this.tx.insert(auditLog).values({
      entity: "alert",
      entityId: alertId,
      actorId: closure.closedBy,
      previousValue: { resolvedAt: null },
      newValue: { resolvedAt: closure.closedAt.toISOString() },
    });
  }

  async lockOpenAlerts(): Promise<LockedOpenAlert[]> {
    const rows = await this.tx
      .select({ alertId: alerts.id, level: alerts.level, escalateAt: alerts.escalateAt })
      .from(alerts)
      .where(openAlertCondition())
      .for("update");
    return rows.map((row) => ({ ...row, resolvedAt: null }));
  }

  async recordEscalation(alertIds: readonly string[], escalation: AlertEscalation): Promise<void> {
    await this.tx
      .update(alerts)
      .set({ level: escalation.level, escalatedAt: escalation.escalatedAt })
      .where(inArray(alerts.id, [...alertIds]));
  }
}

export class DrizzleAlertStore<TQueryResult extends PgQueryResultHKT> implements AlertStore {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(work: (tx: AlertStoreTransaction) => Promise<TOutcome>): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleAlertStoreTransaction(tx)));
  }
}
