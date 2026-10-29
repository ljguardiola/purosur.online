import type { RegisterStatus } from "@purosur/contracts";
import type { ZoneRulesSource } from "@purosur/domain";
import {
  areNewSalesStopped,
  type BatteryReport,
  type CriticalBatteryAction,
  contingencyOf,
  offersSerialDevicesSetup,
  registerOperationAccess,
  registerOwnConditionIdentity,
  registerOwnConditions,
  registerOwnConditionsHeldIfAlreadyStarted,
  registerOwnConditionsNotYetKnown,
  type StorageStanding,
  storageSalesStopOf,
} from "@purosur/domain";
import { observeRegisterOwnConditions } from "@purosur/domain/register/use-cases";
import { readFiscalEmissionModeIn } from "../fiscal/sqlite-fiscal-emission-mode";
import { readLatestPreEmissionGateOutcome } from "../fiscal/sqlite-pre-emission-gate";
import { readLatestClockOffsetMs } from "../fiscal/sqlite-register-health-checks";
import { inArgentinaTime } from "../platform/argentina-time";
import type { LocalDatabase } from "../platform/local-database";
import type { SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import type { CloudReachability } from "../sync/cloud-reachability";
import { SqliteAcceptedPushLog } from "../sync/sqlite-accepted-push-log";
import { salesStopOf } from "../sync/sqlite-local-installation";
import { SqliteLocalReplica } from "../sync/sqlite-local-replica";
import { readStanding, type SerialDeviceReading } from "./serial-device-watch";
import { SqliteRegisterConditionStartStore } from "./sqlite-register-condition-start-store";

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
  onBatteryCountedOnlySinceStart: () => boolean;
  newSalesStoppedByBattery: () => boolean;
  criticalBatteryAction: () => CriticalBatteryAction;
  onConditionStartsNotRecorded: (failure: unknown) => void;
}

export function observedOwnConditionsOf({
  database,
  now,
  zoneRules,
  serialDevices,
  storage,
  localDatabaseDamaged,
  battery,
  onBatteryCountedOnlySinceStart,
  newSalesStoppedByBattery,
  criticalBatteryAction,
  onConditionStartsNotRecorded,
}: RegisterStatusDeps): RegisterStatus["conditions"] {
  const reading = serialDevices();
  const rules = zoneRules.zoneRules();
  const standing = {
    salesStop: salesStopOf(database),
    latestPreEmissionGate: readLatestPreEmissionGateOutcome(database),
    lastAcceptedPushAt: new SqliteAcceptedPushLog(database).lastAcceptedPushAt(),
    hours: new SqliteLocalReplica(database).ownBranchHours(),
    now: now(),
    rules,
    serialDevices: reading.kind === "listed" ? reading.standings : null,
    storage: storage(),
    localDatabaseDamaged: localDatabaseDamaged(),
    battery: battery(),
    onBatteryCountedOnlySinceStart: onBatteryCountedOnlySinceStart(),
    newSalesStoppedByBattery: newSalesStoppedByBattery(),
    criticalBatteryAction: criticalBatteryAction(),
    clockOffsetMs: readLatestClockOffsetMs(database),
  };
  const observation = observeRegisterOwnConditions(
    { store: new SqliteRegisterConditionStartStore(database, zoneRules), clock: { now } },
    {
      held: registerOwnConditions(standing, new Set()).map(registerOwnConditionIdentity),
      heldIfAlreadyStarted: registerOwnConditionsHeldIfAlreadyStarted(standing),
      notYetKnown: registerOwnConditionsNotYetKnown(standing),
    },
  );
  const held = registerOwnConditions(standing, new Set(observation.starts.keys()));
  if (observation.kind === "starts_not_recorded") {
    onConditionStartsNotRecorded(observation.failure);
  }
  return held.map((condition) => ({
    ...condition,
    since: inArgentinaTime(
      observation.starts.get(registerOwnConditionIdentity(condition)) ?? now(),
      rules,
    ),
  }));
}

export async function registerStatusFor(deps: RegisterStatusDeps): Promise<RegisterStatus> {
  const { database, cloud, now, zoneRules, signedInPerson, serialDevices, storage } = deps;
  const reading = serialDevices();
  const standings = {
    scale: readStanding(reading, "scale"),
    reader: readStanding(reading, "reader"),
  };
  const salesStop = salesStopOf(database);
  const storageStanding = storage();
  const damaged = deps.localDatabaseDamaged();
  const stoppedByBattery = deps.newSalesStoppedByBattery();
  return {
    conditions: observedOwnConditionsOf(deps),
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
