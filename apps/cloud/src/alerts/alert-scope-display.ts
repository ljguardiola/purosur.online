import { isAlertKind } from "@purosur/contracts";
import { inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { users } from "../db/schema.js";
import { alertKindDefinition } from "./alert-kind-catalog.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A batch lookup of every given id's first name, for the "ALCANCE" column and the detail screen:
 * one query for a whole page of alerts instead of one per row. An id with no matching active-or-
 * not user (a scope value from before that user was seeded, or a test fixture) is simply left out
 * of the map; `scopeDisplay` falls back to the raw scope for it.
 */
export async function loadScopeDisplayNames<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  // A source address, or a fixture scope from a kind outside the catalog, is never a well-formed
  // uuid: filtered out here rather than sent to a `uuid` column, which would otherwise reject the
  // whole query with an invalid-input-syntax error instead of just skipping that one id.
  const wellFormedIds = userIds.filter((id) => UUID_PATTERN.test(id));
  if (wellFormedIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ id: users.id, firstName: users.firstName })
    .from(users)
    .where(inArray(users.id, wellFormedIds));
  return new Map(rows.map((row) => [row.id, row.firstName]));
}

/**
 * What an alert's own scope reads as to a person: a user-scoped kind's scope is a user id, shown
 * as that user's first name (falling back to the raw id when it can't be resolved); an open
 * source-address-scoped kind's scope is already the address itself, never looked up, and a closed
 * one's is only that address's hash (see alert-close-route.ts), so it reads as nothing. `kind` is
 * read as plain text from `alerts.kind` (see schema.ts), so a value outside the catalog (a
 * fixture, or a kind retired since the alert opened) falls back to the raw scope too, rather than
 * throwing.
 */
export function scopeDisplay(
  alert: { kind: string; scope: string; resolvedAt: Date | null },
  namesByUserId: ReadonlyMap<string, string>,
): string | null {
  if (!isAlertKind(alert.kind)) {
    return alert.scope;
  }
  const { scopeKind } = alertKindDefinition(alert.kind);
  if (scopeKind === "sourceAddress") {
    return alert.resolvedAt === null ? alert.scope : null;
  }
  return namesByUserId.get(alert.scope) ?? alert.scope;
}

/**
 * A closed source-address-scoped alert keeps only the address's hash (see alert-close-route.ts).
 * That hash is unsalted and brute-forceable over the address space, so it's stored but never sent.
 */
export function holdsOnlySourceAddressHash(alert: {
  kind: string;
  resolvedAt: Date | null;
}): boolean {
  return (
    isAlertKind(alert.kind) &&
    alertKindDefinition(alert.kind).scopeKind === "sourceAddress" &&
    alert.resolvedAt !== null
  );
}

/** `scope` as sent to a viewer: `null` whenever it holds only a source address's hash. */
export function wireScope(alert: {
  kind: string;
  scope: string;
  resolvedAt: Date | null;
}): string | null {
  return holdsOnlySourceAddressHash(alert) ? null : alert.scope;
}
