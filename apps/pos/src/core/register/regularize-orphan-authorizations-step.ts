import type { DeviceCredentials } from "@purosur/contracts";
import {
  type RegularizeRestoredOrphanAuthorizationsOutcome,
  type RestorationProtocolEvidence,
  regularizeRestoredOrphanAuthorizations,
} from "@purosur/domain/register/use-cases";
import { CloudOrphanSweep } from "../fiscal/cloud-orphan-sweep";
import type { LocalDatabase } from "../platform/local-database";
import type { PostToCloudWithBearer } from "../sync/cloud-event-inbox";
import type { CloudFailure } from "../sync/cloud-failure";
import { SqliteAwaitedOrphanSweep } from "./sqlite-awaited-orphan-sweep";

export interface RegularizeOrphanAuthorizationsStepDeps {
  database: LocalDatabase | undefined;
  evidence: (database: LocalDatabase) => RestorationProtocolEvidence;
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  post: PostToCloudWithBearer | undefined;
}

export type OrphanSweepAttempt =
  | { kind: "no_local_database" }
  | { kind: "no_cloud" }
  | { kind: "not_enrolled" }
  | RegularizeRestoredOrphanAuthorizationsOutcome<CloudFailure>;

export async function regularizeOrphanAuthorizationsStep(
  deps: RegularizeOrphanAuthorizationsStepDeps,
): Promise<OrphanSweepAttempt> {
  const { database, post } = deps;
  if (database === undefined) {
    return { kind: "no_local_database" };
  }
  if (post === undefined) {
    return { kind: "no_cloud" };
  }
  const credentials = await deps.readCredentials();
  if (credentials === undefined) {
    return { kind: "not_enrolled" };
  }
  return regularizeRestoredOrphanAuthorizations({
    evidence: deps.evidence(database),
    cloud: new CloudOrphanSweep({ post, deviceToken: credentials.device_token }),
    awaited: new SqliteAwaitedOrphanSweep(database),
  });
}

export interface OrphanSweepReport {
  level: "warn";
  message: string;
}

export function orphanSweepReportOf(attempt: OrphanSweepAttempt): OrphanSweepReport | undefined {
  if (attempt.kind !== "failed" || attempt.failure.kind === "unreachable") {
    return undefined;
  }
  return {
    level: "warn",
    message:
      "core: the cloud's sweep of the restored register's orphan authorizations was refused or unreadable, so it will be asked again later",
  };
}
