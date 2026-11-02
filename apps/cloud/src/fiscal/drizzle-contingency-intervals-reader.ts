import { type FiscalAddressAssignment, fiscalAddressPartsOf } from "@purosur/domain";
import type {
  ContingencyIntervalsAtFiscalAddress,
  ContingencyIntervalsQuery,
  ContingencyIntervalsReader,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  registerContingencyIntervals,
  registerContingencyReporting,
  registerFiscalAddressAssignments,
} from "../platform/db/schema.js";

const ASSIGNED_AT_ISO = sql<
  string | null
>`case when ${registerFiscalAddressAssignments.assignedAt} = '-infinity'
  then null
  else to_char(${registerFiscalAddressAssignments.assignedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  end`;

export class DrizzleContingencyIntervalsReader<TQueryResult extends PgQueryResultHKT>
  implements ContingencyIntervalsReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async contingencyIntervalsAtFiscalAddress({
    fiscalAddressId,
    from,
    to,
  }: ContingencyIntervalsQuery): Promise<ContingencyIntervalsAtFiscalAddress> {
    const assignments = await this.assignmentsOfRegistersEverAt(fiscalAddressId);
    const period = { start: from, end: to };
    const registerIds = [...assignments.keys()].filter((registerId) =>
      fiscalAddressPartsOf(period, assignmentsOf(assignments, registerId)).some(
        (part) => part.fiscalAddressId === fiscalAddressId,
      ),
    );
    if (registerIds.length === 0) {
      return { parts: [], registers: [] };
    }

    const intervals = await this.db
      .select({
        registerId: registerContingencyIntervals.registerId,
        startedAt: registerContingencyIntervals.startedAt,
        endedAt: registerContingencyIntervals.endedAt,
      })
      .from(registerContingencyIntervals)
      .where(
        and(
          inArray(registerContingencyIntervals.registerId, registerIds),
          lt(registerContingencyIntervals.startedAt, to),
          or(
            isNull(registerContingencyIntervals.endedAt),
            gt(registerContingencyIntervals.endedAt, from),
          ),
        ),
      )
      .orderBy(asc(registerContingencyIntervals.startedAt));
    const parts = intervals.flatMap(({ registerId, startedAt, endedAt }) =>
      fiscalAddressPartsOf(
        { start: startedAt, end: endedAt },
        assignmentsOf(assignments, registerId),
      )
        .filter(
          (part) =>
            part.fiscalAddressId === fiscalAddressId &&
            part.start < to &&
            (part.end === null || part.end > from),
        )
        .map(({ start, end }) => ({ registerId, start, end })),
    );

    const reporting = await this.db
      .select({
        registerId: registerContingencyReporting.registerId,
        since: registerContingencyReporting.since,
      })
      .from(registerContingencyReporting)
      .where(inArray(registerContingencyReporting.registerId, registerIds));
    const sinceOf = new Map(reporting.map(({ registerId, since }) => [registerId, since]));
    return {
      parts,
      registers: registerIds.map((registerId) => ({
        registerId,
        reportingSince: sinceOf.get(registerId) ?? null,
      })),
    };
  }

  private async assignmentsOfRegistersEverAt(
    fiscalAddressId: string,
  ): Promise<Map<string, FiscalAddressAssignment[]>> {
    const rows = await this.db
      .select({
        registerId: registerFiscalAddressAssignments.registerId,
        fiscalAddressId: registerFiscalAddressAssignments.fiscalAddressId,
        assignedAt: ASSIGNED_AT_ISO,
      })
      .from(registerFiscalAddressAssignments)
      .where(
        inArray(
          registerFiscalAddressAssignments.registerId,
          this.db
            .select({ registerId: registerFiscalAddressAssignments.registerId })
            .from(registerFiscalAddressAssignments)
            .where(eq(registerFiscalAddressAssignments.fiscalAddressId, fiscalAddressId)),
        ),
      )
      .orderBy(
        asc(registerFiscalAddressAssignments.registerId),
        asc(registerFiscalAddressAssignments.assignedAt),
      );
    const byRegister = new Map<string, FiscalAddressAssignment[]>();
    for (const { registerId, fiscalAddressId: assignedTo, assignedAt } of rows) {
      const history = byRegister.get(registerId) ?? [];
      history.push({
        assignedAt: assignedAt === null ? null : new Date(assignedAt),
        fiscalAddressId: assignedTo,
      });
      byRegister.set(registerId, history);
    }
    return byRegister;
  }
}

function assignmentsOf(
  assignments: Map<string, FiscalAddressAssignment[]>,
  registerId: string,
): FiscalAddressAssignment[] {
  return assignments.get(registerId) ?? [];
}
