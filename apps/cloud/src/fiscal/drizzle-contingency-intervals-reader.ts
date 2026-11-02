import { fiscalAddressPartsOf } from "@purosur/domain";
import type {
  ContingencyIntervalsAtFiscalAddress,
  ContingencyIntervalsQuery,
  ContingencyIntervalsReader,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, gt, inArray, isNull, lt, min, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  registerContingencyIntervals,
  registerContingencyReporting,
  registerInstallations,
} from "../platform/db/schema.js";
import {
  type FiscalAddressHistories,
  fiscalAddressHistories,
  historyOf,
} from "./drizzle-register-fiscal-address-histories.js";

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
    const assignments = await fiscalAddressHistories(this.db, fiscalAddressId);
    const period = { start: from, end: to };
    const registerIds = [...assignments.keys()].filter((registerId) =>
      fiscalAddressPartsOf(period, historyOf(assignments, registerId)).some(
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
        historyOf(assignments, registerId),
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
    const enrollments = await this.db
      .select({
        registerId: registerInstallations.registerId,
        firstEnrolledAt: min(registerInstallations.enrolledAt),
      })
      .from(registerInstallations)
      .where(inArray(registerInstallations.registerId, registerIds))
      .groupBy(registerInstallations.registerId);
    const firstEnrolledAtOf = new Map(
      enrollments.map(({ registerId, firstEnrolledAt }) => [registerId, firstEnrolledAt]),
    );
    return {
      parts,
      registers: registerIds.map((registerId) => ({
        registerId,
        reportingSince: sinceOf.get(registerId) ?? null,
        firstEnrolledAt: firstEnrolledAtOf.get(registerId) ?? null,
        presence: presenceAt(assignments, registerId, fiscalAddressId, period),
      })),
    };
  }
}

function presenceAt(
  assignments: FiscalAddressHistories,
  registerId: string,
  fiscalAddressId: string,
  period: { start: Date; end: Date },
): { start: Date; end: Date }[] {
  return fiscalAddressPartsOf(period, historyOf(assignments, registerId)).flatMap((part) =>
    part.fiscalAddressId === fiscalAddressId && part.end !== null
      ? [{ start: part.start, end: part.end }]
      : [],
  );
}
