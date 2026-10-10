import type { RegisterStatus } from "@purosur/contracts";
import { registerOwnConditions } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import type { CloudReachability } from "../sync/cloud-reachability";
import { SqliteAcceptedPushLog } from "../sync/sqlite-accepted-push-log";
import { salesStopOf } from "../sync/sqlite-local-installation";
import { SqliteLocalReplica } from "../sync/sqlite-local-replica";
import { readStanding, type SerialDeviceReading } from "./serial-device-watch";

export interface RegisterStatusDeps {
  database: LocalDatabase;
  cloud: () => CloudReachability;
  now: () => Date;
  serialDevices: () => SerialDeviceReading;
}

export async function registerStatusFor({
  database,
  cloud,
  now,
  serialDevices,
}: RegisterStatusDeps): Promise<RegisterStatus> {
  const reading = serialDevices();
  return {
    conditions: registerOwnConditions({
      salesStop: salesStopOf(database),
      lastAcceptedPushAt: new SqliteAcceptedPushLog(database).lastAcceptedPushAt(),
      hours: new SqliteLocalReplica(database).ownBranchHours(),
      now: now(),
      serialDevices: reading.kind === "listed" ? reading.standings : null,
    }),
    cloud: cloud(),
    serial_devices: {
      scale: readStanding(reading, "scale").kind,
      reader: readStanding(reading, "reader").kind,
    },
  };
}
