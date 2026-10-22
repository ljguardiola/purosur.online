import type { EnrollmentStandingAnswer } from "@purosur/contracts";
import { installationEnrollment } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import { salesStopOf } from "../sync/sqlite-local-installation";

export interface EnrollmentStandingDeps {
  readCredentials: () => Promise<{ device_id: string } | undefined>;
  database: LocalDatabase | undefined;
}

export async function enrollmentStandingOf({
  readCredentials,
  database,
}: EnrollmentStandingDeps): Promise<EnrollmentStandingAnswer> {
  const credentials = await readCredentials();
  if (database === undefined) {
    return { kind: credentials === undefined ? "not_enrolled" : "enrolled" };
  }
  const standing = installationEnrollment({
    credentialsDeviceId: credentials?.device_id,
    heldDeviceId: heldDeviceIdOf(database),
    salesStop: salesStopOf(database),
  });
  return standing.kind === "revoked"
    ? { kind: "revoked", reason: standing.reason ?? null }
    : standing;
}

function heldDeviceIdOf(database: LocalDatabase): string | undefined {
  return (
    database.prepare<[], { device_id: string | null }>("SELECT device_id FROM sync_state").get()
      ?.device_id ?? undefined
  );
}
