export interface QuarantineState {
  appliedAt: Date | null;
  quarantinedAt: Date | null;
}

export interface ReleasedEventState {
  attempts: 0;
  nextAttemptAt: null;
  quarantinedAt: null;
}

export function isQuarantined({ appliedAt, quarantinedAt }: QuarantineState): boolean {
  return appliedAt === null && quarantinedAt !== null;
}

export function releasedForNewSeries(): ReleasedEventState {
  return { attempts: 0, nextAttemptAt: null, quarantinedAt: null };
}
