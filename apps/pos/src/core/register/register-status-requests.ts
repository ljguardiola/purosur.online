import type { RegisterStatus } from "@purosur/contracts";
import { registerOwnConditions } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import type { CloudReachability } from "../sync/cloud-reachability";
import { SqliteAcceptedPushLog } from "../sync/sqlite-accepted-push-log";
import { salesStopOf } from "../sync/sqlite-local-installation";
import { SqliteLocalReplica } from "../sync/sqlite-local-replica";

export interface RegisterStatusDeps {
  database: LocalDatabase;
  cloud: () => CloudReachability;
  now: () => Date;
}

export function registerStatusFor({ database, cloud, now }: RegisterStatusDeps): RegisterStatus {
  return {
    conditions: registerOwnConditions({
      salesStop: salesStopOf(database),
      lastAcceptedPushAt: new SqliteAcceptedPushLog(database).lastAcceptedPushAt(),
      hours: new SqliteLocalReplica(database).ownBranchHours(),
      now: now(),
    }),
    cloud: cloud(),
  };
}
