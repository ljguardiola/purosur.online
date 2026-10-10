import type { RegisterStatus } from "@purosur/contracts";
import {
  registerOwnConditions,
  type SerialDeviceRole,
  type SerialDeviceStanding,
} from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import type { CloudReachability } from "../sync/cloud-reachability";
import { SqliteAcceptedPushLog } from "../sync/sqlite-accepted-push-log";
import { salesStopOf } from "../sync/sqlite-local-installation";
import { SqliteLocalReplica } from "../sync/sqlite-local-replica";

export interface RegisterStatusDeps {
  database: LocalDatabase;
  cloud: () => CloudReachability;
  now: () => Date;
  serialDevices: () => Record<SerialDeviceRole, SerialDeviceStanding>;
}

export function registerStatusFor({
  database,
  cloud,
  now,
  serialDevices,
}: RegisterStatusDeps): RegisterStatus {
  const standings = serialDevices();
  return {
    conditions: registerOwnConditions({
      salesStop: salesStopOf(database),
      lastAcceptedPushAt: new SqliteAcceptedPushLog(database).lastAcceptedPushAt(),
      hours: new SqliteLocalReplica(database).ownBranchHours(),
      now: now(),
      serialDevices: standings,
    }),
    cloud: cloud(),
    serial_devices: { scale: standings.scale.kind, reader: standings.reader.kind },
  };
}
