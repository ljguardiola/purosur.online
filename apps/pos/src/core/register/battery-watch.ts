import type { BatteryReading, BatteryReport } from "@purosur/domain";
import { batteryReportOf, nextOnBatterySince } from "@purosur/domain";
import type { BatteryReader } from "./battery-reader";

export interface BatteryWatchDeps {
  reader: BatteryReader;
  intervalMs: number;
  scheduleNext: (run: () => Promise<void>, delayMs: number) => () => void;
  clock: { now(): Date };
  onFailure?: (error: unknown) => void;
}

export interface BatteryWatch {
  start(): Promise<void>;
  report(): BatteryReport | undefined;
}

export function createBatteryWatch(deps: BatteryWatchDeps): BatteryWatch {
  let latest: BatteryReading | undefined;
  let onBatterySince: Date | undefined;
  let failing = false;

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
  }

  async function read(): Promise<void> {
    await readOnce();
    deps.scheduleNext(read, deps.intervalMs);
  }

  return {
    start: read,
    report: () =>
      latest === undefined ? undefined : batteryReportOf(latest, onBatterySince, deps.clock.now()),
  };
}
