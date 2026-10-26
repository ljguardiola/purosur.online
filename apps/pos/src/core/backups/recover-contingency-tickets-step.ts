import type { DeviceCredentials } from "@purosur/contracts";
import {
  type AwaitContingencyTicketRecoveryOutcome,
  awaitContingencyTicketRecovery,
} from "@purosur/domain/backups/use-cases";
import type { RestorationProtocolEvidence } from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { PostToCloudWithBearer } from "../sync/cloud-event-inbox";
import type { CloudFailure } from "../sync/cloud-failure";
import { CloudContingencyTicketRecovery } from "./cloud-contingency-ticket-recovery";
import { SqliteAwaitedContingencyTicketRecovery } from "./sqlite-awaited-contingency-ticket-recovery";

export interface RecoverContingencyTicketsStepDeps {
  database: LocalDatabase | undefined;
  evidence: (database: LocalDatabase) => RestorationProtocolEvidence;
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  post: PostToCloudWithBearer | undefined;
}

export type ContingencyTicketRecoveryAttempt =
  | { kind: "no_local_database" }
  | { kind: "no_cloud" }
  | { kind: "not_enrolled" }
  | AwaitContingencyTicketRecoveryOutcome<CloudFailure>;

export async function recoverContingencyTicketsStep(
  deps: RecoverContingencyTicketsStepDeps,
): Promise<ContingencyTicketRecoveryAttempt> {
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
  return awaitContingencyTicketRecovery({
    restoration: deps.evidence(database),
    cloud: new CloudContingencyTicketRecovery({ post, deviceToken: credentials.device_token }),
    awaited: new SqliteAwaitedContingencyTicketRecovery(database),
  });
}

export interface ContingencyTicketRecoveryReport {
  level: "warn";
  message: string;
}

export function contingencyTicketRecoveryReportOf(
  attempt: ContingencyTicketRecoveryAttempt,
): ContingencyTicketRecoveryReport | undefined {
  if (attempt.kind !== "failed" || attempt.failure.kind === "unreachable") {
    return undefined;
  }
  return {
    level: "warn",
    message:
      "core: the cloud's answer about the restored register's contingency ticket recovery was refused or unreadable, so it will be asked again later",
  };
}
