import type { BatteryReading, BatteryReport } from "@purosur/domain";
import {
  batteryConditionsOf,
  batteryReportOf,
  batteryReportStanding,
  nextOnBatteryCountedOnlySinceStart,
  nextOnBatterySince,
} from "@purosur/domain";
import type { BatteryReader } from "./battery-reader";

export interface BatteryWatchDeps {
  reader: BatteryReader;
  intervalMs: number;
  scheduleNext: (run: () => Promise<void>, delayMs: number) => () => void;
  clock: { now(): Date };
  onChange?: () => void;
  onFailure?: (error: unknown) => void;
}

export interface BatteryWatch {
  start(): Promise<void>;
  report(): BatteryReport | undefined;
  onBatteryCountedOnlySinceStart(): boolean;
}

function conditionsKey(report: BatteryReport | undefined): string {
  return JSON.stringify([batteryReportStanding(report), batteryConditionsOf(report)]);
}

export function createBatteryWatch(deps: BatteryWatchDeps): BatteryWatch {
  let latest: BatteryReading | undefined;
  let onBatterySince: Date | undefined;
  let onBatteryCountedOnlySinceStart = true;
  let failing = false;
  let announced = conditionsKey(undefined);

  async function readOnce(): Promise<void> {
    let reading: BatteryReading;
    try {
      reading = await deps.reader.read();
      failing = false;
    } catch (error) {
      reading = { kind: "unreadable" };
      if (!failing) {
        failing = true;
        deps.onFailure?.(error);
      }
    }
    latest = reading;
    onBatterySince = nextOnBatterySince(onBatterySince, reading, deps.clock.now());
    onBatteryCountedOnlySinceStart = nextOnBatteryCountedOnlySinceStart(
      onBatteryCountedOnlySinceStart,
      reading,
    );
    announceChange();
  }

  function currentReport(): BatteryReport | undefined {
    return latest === undefined
      ? undefined
      : batteryReportOf(latest, onBatterySince, deps.clock.now());
  }

  function announceChange(): void {
    const key = conditionsKey(currentReport());
    if (key !== announced) {
      announced = key;
      deps.onChange?.();
    }
  }

  async function read(): Promise<void> {
    await readOnce();
    deps.scheduleNext(read, deps.intervalMs);
  }

  return {
    start: read,
    report: currentReport,
    onBatteryCountedOnlySinceStart: () => onBatteryCountedOnlySinceStart,
  };
}
