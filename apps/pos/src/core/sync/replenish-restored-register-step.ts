import type { DeviceCredentials } from "@purosur/contracts";
import type { IdGenerator } from "@purosur/domain/register/use-cases";
import {
  type ReplenishRestoredRegisterOutcome,
  replenishRestoredRegister,
} from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { PostToCloudWithBearer } from "./cloud-event-inbox";
import type { CloudFailure } from "./cloud-failure";
import { CloudRegisterReplenishment } from "./cloud-register-replenishment";
import { replenishedEventDecoder } from "./replenished-event-decoder";
import { SqliteRegisterReplenishmentStore } from "./sqlite-register-replenishment-store";

export interface ReplenishRestoredRegisterStepDeps {
  database: LocalDatabase | undefined;
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  post: PostToCloudWithBearer | undefined;
  ids: IdGenerator;
}

export type ReplenishAttempt =
  | { kind: "no_local_database" }
  | { kind: "no_cloud" }
  | { kind: "not_enrolled" }
  | ReplenishRestoredRegisterOutcome<CloudFailure>;

export async function replenishRestoredRegisterStep(
  deps: ReplenishRestoredRegisterStepDeps,
): Promise<ReplenishAttempt> {
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
  return replenishRestoredRegister({
    feed: new CloudRegisterReplenishment({ post, deviceToken: credentials.device_token }),
    store: new SqliteRegisterReplenishmentStore({
      database,
      pepper: credentials.pepper,
      ids: deps.ids,
    }),
    decoder: replenishedEventDecoder,
  });
}

export interface ReplenishmentReport {
  level: "error" | "warn";
  message: string;
}

export function replenishmentReportOf(attempt: ReplenishAttempt): ReplenishmentReport | undefined {
  switch (attempt.kind) {
    case "refused":
      return {
        level: "error",
        message: `core: the cloud refused to replenish the restored register (${attempt.refusal}), so it stays pending`,
      };
    case "unreadable_event":
      return {
        level: "error",
        message: `core: event ${attempt.eventId} cannot be read (${attempt.reason}), so the restored register stays pending its replenishment`,
      };
    case "partially_replenished":
      return {
        level: "warn",
        message: `core: ${attempt.unapplied} events of the restored register's predecessor cannot be applied yet, so its replenishment stays pending`,
      };
    case "failed":
      return attempt.failure.kind === "unreachable"
        ? undefined
        : {
            level: "warn",
            message:
              "core: the cloud's replenishment of the restored register was refused or unreadable, so it will be asked again later",
          };
    default:
      return undefined;
  }
}
