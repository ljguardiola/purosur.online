export const REGISTER_BACKUP_OVERDUE_AFTER_MS = 60 * 60 * 1000;

export interface RegisterBackupStanding {
  registerId: string;
  locationId: string;
  lastVerifiedGenerationAt: Date | null;
  firstChangeSinceLastVerifiedAt: Date | null;
}

export function isRegisterBackupOverdue({
  firstChangeSinceLastVerifiedAt,
  now,
}: {
  firstChangeSinceLastVerifiedAt: Date | null;
  now: Date;
}): boolean {
  return (
    firstChangeSinceLastVerifiedAt !== null &&
    now.getTime() - firstChangeSinceLastVerifiedAt.getTime() > REGISTER_BACKUP_OVERDUE_AFTER_MS
  );
}
