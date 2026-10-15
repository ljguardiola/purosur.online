import type { RegisterStatus } from "@purosur/contracts";
import {
  offersSerialDevicesSetup,
  registerOperationAccess,
  registerOwnConditions,
  type StorageStanding,
} from "@purosur/domain";
import { readLatestPreEmissionGateOutcome } from "../fiscal/sqlite-pre-emission-gate";
import type { LocalDatabase } from "../platform/local-database";
import type { SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import type { CloudReachability } from "../sync/cloud-reachability";
import { SqliteAcceptedPushLog } from "../sync/sqlite-accepted-push-log";
import { salesStopOf } from "../sync/sqlite-local-installation";
import { SqliteLocalReplica } from "../sync/sqlite-local-replica";
import { readStanding, type SerialDeviceReading } from "./serial-device-watch";

export interface RegisterStatusDeps {
  database: LocalDatabase;
  cloud: () => CloudReachability;
  now: () => Date;
  signedInPerson: Pick<SignedInPerson, "userId">;
  serialDevices: () => SerialDeviceReading;
  storage: () => StorageStanding;
  localDatabaseDamaged: () => boolean;
}

export async function registerStatusFor({
  database,
  cloud,
  now,
  signedInPerson,
  serialDevices,
  storage,
  localDatabaseDamaged,
}: RegisterStatusDeps): Promise<RegisterStatus> {
  const reading = serialDevices();
  const standings = {
    scale: readStanding(reading, "scale"),
    reader: readStanding(reading, "reader"),
  };
  return {
    conditions: registerOwnConditions({
      salesStop: salesStopOf(database),
      latestPreEmissionGate: readLatestPreEmissionGateOutcome(database),
      lastAcceptedPushAt: new SqliteAcceptedPushLog(database).lastAcceptedPushAt(),
      hours: new SqliteLocalReplica(database).ownBranchHours(),
      now: now(),
      serialDevices: reading.kind === "listed" ? reading.standings : null,
      storage: storage(),
      localDatabaseDamaged: localDatabaseDamaged(),
    }),
    cloud: cloud(),
    serial_devices: {
      scale: standings.scale.kind,
      reader: standings.reader.kind,
    },
    serial_devices_setup_offered: offersSerialDevicesSetup({
      mayConfigure: mayConfigureSerialDevices(database, signedInPerson),
      standings,
    }),
  };
}

function mayConfigureSerialDevices(
  database: LocalDatabase,
  signedInPerson: Pick<SignedInPerson, "userId">,
): boolean {
  const id = signedInPerson.userId();
  const access =
    id === undefined ? undefined : new SqliteSignInStore(database).activePerson(id)?.access;
  return (
    id !== undefined &&
    access !== undefined &&
    registerOperationAccess({ kind: "configure_serial_devices" }, { id, access }).kind ===
      "permitted"
  );
}
