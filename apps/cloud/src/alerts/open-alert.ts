import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alertDeliveries, alerts, rolePermissions, roles, userRoles, users } from "../db/schema.js";
import { type AlertKind, alertKindDefinition } from "./alert-kind-catalog.js";
import { VIEW_ALL_ALERTS_PERMISSION, VIEW_BRANCH_ALERTS_PERMISSION } from "./alert-visibility.js";

const UNIQUE_VIOLATION = "23505";
const ALERT_OPEN_DEDUP_UNIQUE_INDEX = "alerts_open_dedup_key";

/**
 * Walks the driver error (wrapped by Drizzle as its `cause`) for a unique violation on the
 * partial dedup index over open alerts, the same "postgres-js names it `constraint_name`, PGlite
 * names it `constraint`" reasoning `isRoleNameUniqueViolation` (`role-creation-route.ts`) already
 * gives for its own unique index.
 */
export function isAlertOpenDedupViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint, constraint_name } = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
    };
    const index = constraint_name ?? constraint;
    if (code === UNIQUE_VIOLATION && index === ALERT_OPEN_DEDUP_UNIQUE_INDEX) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

// The transaction type `openAlert` runs inside: the same shape the caller's own `db.transaction`
// callback receives, so this never opens its own transaction (the caller already holds one, the
// same fact that triggered the alert).
type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

/**
 * A passkey change's own fact: account recovery only ever registers a passkey, and an
 * Administrator only ever removes someone else's.
 */
export type PasskeyChangedDetail =
  | { action: "registered" | "removed"; passkeyName: string; actorId: string; via: "self" }
  | { action: "registered"; passkeyName: string; actorId: string; via: "recovery" }
  | { action: "removed"; passkeyName: string; actorId: string; via: "administrator" };

export type OpenAlertInput = {
  /** The other half of the deduplication key: a user id, a source address… varies by kind. */
  scope: string;
  /** Required only for a Local-audience kind; no catalog kind uses one yet. */
  locationId?: string;
} & (
  | { kind: "backoffice_passkey_changed"; detail: PasskeyChangedDetail }
  | {
      kind: Exclude<AlertKind, "backoffice_passkey_changed">;
      detail: Record<string, unknown>;
    }
);

export interface OpenAlertDeps {
  now: () => Date;
}

export type OpenAlertOutcome =
  | { kind: "opened"; alertId: string }
  | { kind: "already_open"; alertId: string };

/**
 * Finds every active user who can see an alert of `audience` (and, for a Local one, scoped to
 * `locationId`) the moment it opens: an Administrator or a `view_all_alerts` holder sees every
 * alert; a `view_branch_alerts` holder sees only a Local one of their own branch (never an All
 * one), matching the business rule the same way `isAccessGranted` (`route-access.ts`) treats an
 * Administrator as implicitly holding every permission.
 */
export async function recipientsFor<TQueryResult extends PgQueryResultHKT>(
  tx: Transaction<TQueryResult>,
  audience: "local" | "all",
  locationId: string | undefined,
): Promise<string[]> {
  const viewAllRoleIds = tx
    .select({ roleId: rolePermissions.roleId })
    .from(rolePermissions)
    .where(eq(rolePermissions.permissionKey, VIEW_ALL_ALERTS_PERMISSION));
  const viewLocalRoleIds = tx
    .select({ roleId: rolePermissions.roleId })
    .from(rolePermissions)
    .where(eq(rolePermissions.permissionKey, VIEW_BRANCH_ALERTS_PERMISSION));

  const localVisibility =
    audience === "local" && locationId !== undefined
      ? and(eq(users.locationId, locationId), inArray(roles.id, viewLocalRoleIds))
      : undefined;

  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        eq(users.active, true),
        or(eq(roles.isAdministrator, true), inArray(roles.id, viewAllRoleIds), localVisibility),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * Opens an alert for `input.kind`/`input.scope`, deriving its level, escalation deadline and
 * audience from the kind catalog (`alert-kind-catalog.ts`), and writes one delivery row per active
 * user who can see it. Runs inside the caller's own transaction: the alert opens in the same
 * transaction as the fact that triggered it, never a separate one.
 *
 * Idempotent under deduplication: relies on the partial unique index over open alerts
 * (`alerts_open_dedup_key`) as the backstop for a concurrent trigger of the same kind and scope
 * landing between two transactions, the same "insert, catch the unique violation" shape
 * `role-creation-route.ts` uses for a role name. A second trigger while one is already open opens
 * nothing and delivers nothing new.
 */
export async function openAlert<TQueryResult extends PgQueryResultHKT>(
  tx: Transaction<TQueryResult>,
  input: OpenAlertInput,
  deps: OpenAlertDeps,
): Promise<OpenAlertOutcome> {
  const definition = alertKindDefinition(input.kind);
  const openedAt = deps.now();
  const escalateAt =
    definition.escalatesAfterMs === null
      ? null
      : new Date(openedAt.getTime() + definition.escalatesAfterMs);
  const locationId = definition.audience === "local" ? (input.locationId ?? null) : null;

  // Attempted in its own savepoint (a nested `tx.transaction`), never a plain `tx.insert`: a
  // unique-violation on the dedup index aborts whatever statement runs it, and without a
  // savepoint that abort would poison the caller's own outer transaction too, instead of leaving
  // it free to read the already-open alert back and carry on.
  let created: { id: string } | undefined;
  try {
    const [row] = await tx.transaction((savepoint) =>
      savepoint
        .insert(alerts)
        .values({
          kind: input.kind,
          scope: input.scope,
          level: definition.level,
          audience: definition.audience,
          locationId,
          detail: input.detail,
          openedAt,
          escalateAt,
        })
        .returning({ id: alerts.id }),
    );
    created = row;
  } catch (error) {
    if (!isAlertOpenDedupViolation(error)) {
      throw error;
    }
  }

  if (!created) {
    const [existing] = await tx
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(eq(alerts.kind, input.kind), eq(alerts.scope, input.scope), isNull(alerts.resolvedAt)),
      );
    if (!existing) {
      // The row that caused the unique violation is, by definition, an open alert of this same
      // kind and scope; a caller that reads nothing back here has a driver/index mismatch.
      throw new Error(
        `openAlert: dedup violation for ${input.kind}/${input.scope} but no open alert found`,
      );
    }
    return { kind: "already_open", alertId: existing.id };
  }

  const recipients = await recipientsFor(tx, definition.audience, input.locationId);
  if (recipients.length > 0) {
    await tx.insert(alertDeliveries).values(
      recipients.map((recipientUserId) => ({
        alertId: created.id,
        recipientUserId,
        channel: "backoffice" as const,
        status: "sent" as const,
      })),
    );
  }

  return { kind: "opened", alertId: created.id };
}
