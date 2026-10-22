import type { EnrollmentStandingAnswer } from "@purosur/contracts";
import { installationEnrollment } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import { heldDeviceId } from "../sync/sqlite-installation-presence";
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
  return installationEnrollment({
    credentialsDeviceId: credentials?.device_id,
    heldDeviceId: heldDeviceId(database),
    salesStop: salesStopOf(database),
  });
}
