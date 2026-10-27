import type { RegisterStatus } from "@purosur/contracts";
import type { ZoneRulesSource } from "@purosur/domain";
import {
  areNewSalesStopped,
  type BatteryReport,
  type CriticalBatteryAction,
  contingencyOf,
  offersSerialDevicesSetup,
  registerOperationAccess,
  registerOwnConditions,
  type StorageStanding,
  storageSalesStopOf,
} from "@purosur/domain";
import { readFiscalEmissionModeIn } from "../fiscal/sqlite-fiscal-emission-mode";
import { readLatestPreEmissionGateOutcome } from "../fiscal/sqlite-pre-emission-gate";
import { readLatestClockOffsetMs } from "../fiscal/sqlite-register-health-checks";
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
  zoneRules: ZoneRulesSource;
  signedInPerson: Pick<SignedInPerson, "userId">;
  serialDevices: () => SerialDeviceReading;
  storage: () => StorageStanding;
  localDatabaseDamaged: () => boolean;
  battery: () => BatteryReport | undefined;
  newSalesStoppedByBattery: () => boolean;
  criticalBatteryAction: () => CriticalBatteryAction;
}

export async function registerStatusFor({
  database,
  cloud,
  now,
  zoneRules,
  signedInPerson,
  serialDevices,
  storage,
  localDatabaseDamaged,
  battery,
  newSalesStoppedByBattery,
  criticalBatteryAction,
}: RegisterStatusDeps): Promise<RegisterStatus> {
  const reading = serialDevices();
  const standings = {
    scale: readStanding(reading, "scale"),
    reader: readStanding(reading, "reader"),
  };
  const salesStop = salesStopOf(database);
  const storageStanding = storage();
  const damaged = localDatabaseDamaged();
  const stoppedByBattery = newSalesStoppedByBattery();
  return {
    conditions: registerOwnConditions({
      salesStop,
      latestPreEmissionGate: readLatestPreEmissionGateOutcome(database),
      lastAcceptedPushAt: new SqliteAcceptedPushLog(database).lastAcceptedPushAt(),
      hours: new SqliteLocalReplica(database).ownBranchHours(),
      now: now(),
      rules: zoneRules.zoneRules(),
      serialDevices: reading.kind === "listed" ? reading.standings : null,
      storage: storageStanding,
      localDatabaseDamaged: damaged,
      battery: battery(),
      newSalesStoppedByBattery: stoppedByBattery,
      criticalBatteryAction: criticalBatteryAction(),
      clockOffsetMs: readLatestClockOffsetMs(database),
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
    contingency: contingencyOf(
      readFiscalEmissionModeIn(database, now(), zoneRules),
      areNewSalesStopped(salesStop, storageSalesStopOf(storageStanding), damaged, stoppedByBattery),
    ),
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
