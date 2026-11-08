import { compareCodeUnits, compareSpanishText, installationSyncedLastOf } from "@purosur/domain";
import type {
  BranchRegisterLastSync,
  BranchRegisterSyncReader,
  RegisterBatteryState,
  RegisterDiskState,
} from "@purosur/domain/installation/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deviceState, registerInstallations, registers } from "../platform/db/schema.js";

interface ReportedState {
  lastAcceptedPushAt: Date | null;
  batteryReportedAt: Date | null;
  batteryPresent: boolean | null;
  batteryChargePercent: number | null;
  batteryHealthPercent: number | null;
  batteryOnBattery: boolean | null;
  batteryOnBatteryMinutes: number | null;
  diskFreeBytes: number | null;
  diskFreeRatio: number | null;
}

function batteryReportedBeforeLastAcceptedPush(state: ReportedState): boolean {
  return (
    state.batteryReportedAt !== null &&
    state.lastAcceptedPushAt !== null &&
    state.batteryReportedAt < state.lastAcceptedPushAt
  );
}

function batteryOf(state: ReportedState): RegisterBatteryState | null {
  if (state.batteryPresent === null || batteryReportedBeforeLastAcceptedPush(state)) {
    return null;
  }
  if (!state.batteryPresent) {
    return { present: false };
  }
  return {
    present: true,
    chargePercent: state.batteryChargePercent ?? 0,
    healthPercent: state.batteryHealthPercent,
    onBattery: state.batteryOnBattery ?? false,
    onBatteryMinutes: state.batteryOnBatteryMinutes ?? 0,
  };
}

function diskOf(state: ReportedState): RegisterDiskState | null {
  return state.diskFreeBytes === null || state.diskFreeRatio === null
    ? null
    : { freeBytes: state.diskFreeBytes, freeRatio: state.diskFreeRatio };
}

export class DrizzleBranchRegisterSyncReader<TQueryResult extends PgQueryResultHKT>
  implements BranchRegisterSyncReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async lastSuccessfulSyncOfBranchRegisters(locationId: string): Promise<BranchRegisterLastSync[]> {
    const installations = await this.db
      .select({
        id: registers.id,
        name: registers.name,
        lastAcceptedPushAt: deviceState.lastAcceptedPushAt,
        batteryReportedAt: deviceState.batteryReportedAt,
        batteryPresent: deviceState.batteryPresent,
        batteryChargePercent: deviceState.batteryChargePercent,
        batteryHealthPercent: deviceState.batteryHealthPercent,
        batteryOnBattery: deviceState.batteryOnBattery,
        batteryOnBatteryMinutes: deviceState.batteryOnBatteryMinutes,
        diskFreeBytes: deviceState.diskFreeBytes,
        diskFreeRatio: deviceState.diskFreeRatio,
      })
      .from(registers)
      .leftJoin(registerInstallations, eq(registerInstallations.registerId, registers.id))
      .leftJoin(deviceState, eq(deviceState.deviceId, registerInstallations.id))
      .where(eq(registers.locationId, locationId));
    installations.sort(
      (a, b) => compareSpanishText(a.name, b.name) || compareCodeUnits(a.id, b.id),
    );
    const registerNames = new Map(installations.map(({ id, name }) => [id, name]));
    return [...registerNames].map(([id, name]) => {
      const syncedLast = installationSyncedLastOf(
        installations.filter((installation) => installation.id === id),
      );
      return {
        id,
        name,
        lastSuccessfulSyncAt: syncedLast?.lastAcceptedPushAt ?? null,
        battery: syncedLast === null ? null : batteryOf(syncedLast),
        disk: syncedLast === null ? null : diskOf(syncedLast),
      };
    });
  }
}
