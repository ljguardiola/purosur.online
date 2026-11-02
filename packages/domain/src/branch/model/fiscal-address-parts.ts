export interface FiscalAddressAssignment {
  assignedAt: Date | null;
  fiscalAddressId: string;
}

export interface TimeInterval {
  start: Date;
  end: Date | null;
}

export interface FiscalAddressPart extends TimeInterval {
  fiscalAddressId: string;
}

function assignedAtMillis({ assignedAt }: FiscalAddressAssignment): number {
  return assignedAt === null ? Number.NEGATIVE_INFINITY : assignedAt.getTime();
}

export function fiscalAddressPartsOf(
  interval: TimeInterval,
  assignments: readonly FiscalAddressAssignment[],
): FiscalAddressPart[] {
  const intervalEnd = interval.end === null ? Number.POSITIVE_INFINITY : interval.end.getTime();
  return assignments.flatMap((assignment, index) => {
    const next = assignments[index + 1];
    const start = Math.max(interval.start.getTime(), assignedAtMillis(assignment));
    const end = Math.min(
      intervalEnd,
      next === undefined ? Number.POSITIVE_INFINITY : assignedAtMillis(next),
    );
    if (start >= end) {
      return [];
    }
    return [
      {
        fiscalAddressId: assignment.fiscalAddressId,
        start: new Date(start),
        end: end === Number.POSITIVE_INFINITY ? null : new Date(end),
      },
    ];
  });
}

export function fiscalAddressAt(
  instant: Date,
  assignments: readonly FiscalAddressAssignment[],
): string | null {
  const [first] = fiscalAddressPartsOf({ start: instant, end: null }, assignments);
  return first !== undefined && first.start.getTime() === instant.getTime()
    ? first.fiscalAddressId
    : null;
}
