import type { FiscalAddressAssignment } from "@purosur/domain";
import { asc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerFiscalAddressAssignments } from "../platform/db/schema.js";

const ASSIGNED_AT_ISO = sql<
  string | null
>`case when ${registerFiscalAddressAssignments.assignedAt} = '-infinity'
  then null
  else to_char(${registerFiscalAddressAssignments.assignedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  end`;

export type FiscalAddressHistories = Map<string, FiscalAddressAssignment[]>;

export function registersEverAt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  fiscalAddressId: string,
) {
  return db
    .select({ registerId: registerFiscalAddressAssignments.registerId })
    .from(registerFiscalAddressAssignments)
    .where(eq(registerFiscalAddressAssignments.fiscalAddressId, fiscalAddressId));
}

export async function fiscalAddressHistories<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  fiscalAddressId?: string,
): Promise<FiscalAddressHistories> {
  const rows = await db
    .select({
      registerId: sql<string>`${registerFiscalAddressAssignments.registerId}::text`,
      fiscalAddressId: sql<string>`${registerFiscalAddressAssignments.fiscalAddressId}::text`,
      assignedAt: ASSIGNED_AT_ISO,
    })
    .from(registerFiscalAddressAssignments)
    .where(fiscalAddressId === undefined ? undefined : everAt(db, fiscalAddressId))
    .orderBy(
      asc(registerFiscalAddressAssignments.registerId),
      asc(registerFiscalAddressAssignments.assignedAt),
    );
  const histories: FiscalAddressHistories = new Map();
  for (const { registerId, fiscalAddressId: assignedTo, assignedAt } of rows) {
    const history = histories.get(registerId) ?? [];
    history.push({
      assignedAt: assignedAt === null ? null : new Date(assignedAt),
      fiscalAddressId: assignedTo,
    });
    histories.set(registerId, history);
  }
  return histories;
}

function everAt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  fiscalAddressId: string,
): SQL {
  return inArray(registerFiscalAddressAssignments.registerId, registersEverAt(db, fiscalAddressId));
}

export function historyOf(
  histories: FiscalAddressHistories,
  registerId: string,
): FiscalAddressAssignment[] {
  return histories.get(registerId) ?? [];
}
