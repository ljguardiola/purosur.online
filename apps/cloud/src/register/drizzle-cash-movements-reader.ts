import type { ReportedCashMovement } from "@purosur/domain";
import { ARGENTINA_TIME_ZONE, CASH_MOVEMENT_KINDS, type CashMovementKind } from "@purosur/domain";
import type {
  CashMovementsQuery,
  CashMovementsReportReader,
} from "@purosur/domain/register/use-cases";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { cashMovements, cashSessions, registers } from "../platform/db/schema.js";

const movementDay = sql<string>`to_char(${cashMovements.occurredAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

function isReportedKind(type: string): type is CashMovementKind {
  return CASH_MOVEMENT_KINDS.some((kind) => kind === type);
}

export class DrizzleCashMovementsReader<TQueryResult extends PgQueryResultHKT>
  implements CashMovementsReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async reportedCashMovements({
    locationId,
    range,
    registerId,
  }: CashMovementsQuery): Promise<ReportedCashMovement[]> {
    const rows = await this.db
      .select({
        id: cashMovements.id,
        occurredAt: cashMovements.occurredAt,
        type: cashMovements.type,
        reason: cashMovements.reason,
        amount: cashMovements.amount,
        sessionId: cashMovements.sessionId,
        registerName: registers.name,
        sessionOpenedAt: cashSessions.openedAt,
      })
      .from(cashMovements)
      .innerJoin(cashSessions, eq(cashSessions.id, cashMovements.sessionId))
      .innerJoin(registers, eq(registers.id, cashSessions.registerId))
      .where(
        and(
          eq(cashSessions.locationId, locationId),
          inArray(cashMovements.type, [...CASH_MOVEMENT_KINDS]),
          registerId === undefined ? undefined : eq(cashSessions.registerId, registerId),
          sql`${movementDay} >= ${range.from}`,
          sql`${movementDay} <= ${range.to}`,
        ),
      );

    return rows.map((row) => {
      if (row.reason === null || !isReportedKind(row.type)) {
        throw new Error(`The cash movement ${row.id} has no reason`);
      }
      return {
        id: row.id,
        occurredAt: row.occurredAt,
        kind: row.type,
        reason: row.reason,
        amount: row.amount,
        sessionId: row.sessionId,
        registerName: row.registerName,
        sessionOpenedAt: row.sessionOpenedAt,
      };
    });
  }
}
