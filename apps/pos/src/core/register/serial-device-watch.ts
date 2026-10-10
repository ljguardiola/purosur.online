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

export interface SerialDeviceWatch {
  start(): Promise<void>;
  checkNow(): Promise<void>;
  standings(): Standings;
  locate(role: SerialDeviceRole): string | undefined;
}

function standingsKey(standings: Standings): string {
  return JSON.stringify(SERIAL_DEVICE_ROLES.map((role) => standings[role]));
}

export function createSerialDeviceWatch(deps: SerialDeviceWatchDeps): SerialDeviceWatch {
  let latest: Standings | undefined;
  let running: Promise<void> | undefined;
  let askedWhileRunning = false;
  let cancelNext: (() => void) | undefined;

  function registered(): RegisteredSerialDevices {
    return deps.registrations.registeredSerialDevices();
  }

  function standings(): Standings {
    return latest ?? serialDeviceStandings(registered(), []);
  }

  async function checkOnce(): Promise<void> {
    try {
      const detected = await deps.enumeration.detectedSerialDevices();
      const next = serialDeviceStandings(registered(), detected);
      const changed = standingsKey(next) !== standingsKey(standings());
      latest = next;
      if (changed) {
        deps.onChange();
      }
    } catch (error) {
      deps.onFailure(error);
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
    standings,
    locate: (role) => {
      const standing = standings()[role];
      return standing.kind === "matching" ? standing.path : undefined;
    },
  };
}
