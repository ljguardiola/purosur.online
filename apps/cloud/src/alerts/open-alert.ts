import type { AlertKind } from "@purosur/contracts";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { alertDeliveries, alerts, roles, userRoles, users } from "../platform/db/schema.js";
import { alertKindDefinition } from "./alert-kind-catalog.js";
import { visibleToUsersJoinedWithRolesCondition } from "./alert-visibility.js";

const UNIQUE_VIOLATION = "23505";
const ALERT_OPEN_DEDUP_UNIQUE_INDEX = "alerts_open_dedup_key";

export function isAlertOpenDedupViolation(error: unknown): boolean {
  return postgresErrorChain(error).some(
    ({ code, constraint }) =>
      code === UNIQUE_VIOLATION && constraint === ALERT_OPEN_DEDUP_UNIQUE_INDEX,
  );
}

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

export type PasskeyChangedDetail =
  | { action: "registered" | "removed"; passkeyName: string; actorId: string; via: "self" }
  | { action: "registered"; passkeyName: string; actorId: string; via: "recovery" }
  | { action: "removed"; passkeyName: string; actorId: string; via: "administrator" };

export type OpenAlertInput = {
  scope: string;
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

export async function recipientsFor<TQueryResult extends PgQueryResultHKT>(
  tx: Transaction<TQueryResult>,
  audience: "local" | "all",
  locationId: string | undefined,
): Promise<string[]> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        eq(users.active, true),
        visibleToUsersJoinedWithRolesCondition(tx, { audience, locationId }),
      ),
    );
  return rows.map((row) => row.id);
}

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

  // A unique violation aborts the whole transaction unless it happens inside a savepoint.
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
