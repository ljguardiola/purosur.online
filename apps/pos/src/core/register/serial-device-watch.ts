import type {
  RegisteredSerialDevices,
  SerialDeviceRole,
  SerialDeviceStanding,
} from "@purosur/domain";
import { SERIAL_DEVICE_ROLES, serialDeviceStandings } from "@purosur/domain";
import type {
  SerialDeviceEnumeration,
  SerialDeviceRegistrations,
} from "@purosur/domain/register/use-cases";

type Standings = Record<SerialDeviceRole, SerialDeviceStanding>;

export interface SerialDeviceWatchDeps {
  registrations: Pick<SerialDeviceRegistrations, "registeredSerialDevices">;
  enumeration: SerialDeviceEnumeration;
  intervalMs: number;
  scheduleNext: (run: () => Promise<void>, delayMs: number) => () => void;
  onChange: () => void;
  onFailure: (error: unknown) => void;
}

export type SerialDeviceReading =
  | { kind: "listed"; standings: Standings }
  | { kind: "unknown"; registered: RegisteredSerialDevices };

export interface SerialDeviceWatch {
  start(): Promise<void>;
  checkNow(): Promise<void>;
  reading(): SerialDeviceReading;
}

export function readStanding(
  reading: SerialDeviceReading,
  role: SerialDeviceRole,
): SerialDeviceStanding | { kind: "unknown" } {
  if (reading.kind === "listed") {
    return reading.standings[role];
  }
  return reading.registered[role] === undefined ? { kind: "not_registered" } : { kind: "unknown" };
}

function readingKey(reading: SerialDeviceReading): string {
  return JSON.stringify(SERIAL_DEVICE_ROLES.map((role) => readStanding(reading, role)));
}

export function createSerialDeviceWatch(deps: SerialDeviceWatchDeps): SerialDeviceWatch {
  let current: Standings | undefined;
  let running: Promise<void> | undefined;
  let askedWhileRunning = false;
  let cancelNext: (() => void) | undefined;
  let failing = false;

  function reading(): SerialDeviceReading {
    return current === undefined
      ? { kind: "unknown", registered: deps.registrations.registeredSerialDevices() }
      : { kind: "listed", standings: current };
  }

  function settle(next: Standings | undefined): void {
    const before = readingKey(reading());
    current = next;
    if (readingKey(reading()) !== before) {
      deps.onChange();
    }
  }

  async function checkOnce(): Promise<void> {
    try {
      const detected = await deps.enumeration.detectedSerialDevices();
      failing = false;
      settle(serialDeviceStandings(deps.registrations.registeredSerialDevices(), detected));
    } catch (error) {
      settle(undefined);
      if (!failing) {
        failing = true;
        deps.onFailure(error);
      }
    }
  }

  async function check(): Promise<void> {
    cancelNext?.();
    cancelNext = undefined;
    if (running !== undefined) {
      askedWhileRunning = true;
      return running;
    }
    running = (async () => {
      do {
        askedWhileRunning = false;
        await checkOnce();
      } while (askedWhileRunning);
    })();
    await running;
    running = undefined;
    cancelNext = deps.scheduleNext(check, deps.intervalMs);
  }

  return {
    start: check,
    checkNow: check,
    reading,
  };
}
