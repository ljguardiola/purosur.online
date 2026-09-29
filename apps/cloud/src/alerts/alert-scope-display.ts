import { isAlertKind } from "@purosur/domain";
import { inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registers, users } from "../platform/db/schema.js";
import { alertKindDefinition } from "./alert-kind-catalog.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadScopeDisplayNames<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  ids: readonly string[],
): Promise<Map<string, string>> {
  // Postgres rejects the whole query on one malformed `uuid` instead of skipping that id.
  const wellFormedIds = ids.filter((id) => UUID_PATTERN.test(id));
  if (wellFormedIds.length === 0) {
    return new Map();
  }
  const userRows = await db
    .select({ id: users.id, name: users.firstName })
    .from(users)
    .where(inArray(users.id, wellFormedIds));
  const registerRows = await db
    .select({ id: registers.id, name: registers.name })
    .from(registers)
    .where(inArray(registers.id, wellFormedIds));
  return new Map([...userRows, ...registerRows].map((row) => [row.id, row.name]));
}

export function scopeDisplay(
  alert: { kind: string; scope: string; resolvedAt: Date | null },
  namesById: ReadonlyMap<string, string>,
): string | null {
  if (!isAlertKind(alert.kind)) {
    return alert.scope;
  }
  const { scopeKind } = alertKindDefinition(alert.kind);
  if (scopeKind === "sourceAddress") {
    return alert.resolvedAt === null ? alert.scope : null;
  }
  return namesById.get(alert.scope) ?? alert.scope;
}

// The hash is unsalted and brute-forceable over the address space, so it's stored but never sent.
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

export function wireScope(alert: {
  kind: string;
  scope: string;
  resolvedAt: Date | null;
}): string | null {
  return holdsOnlySourceAddressHash(alert) ? null : alert.scope;
}
