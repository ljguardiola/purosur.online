import type { DeviceCredentials } from "@purosur/contracts";
import type { LocalDatabase } from "../platform/local-database";
import { installationHeld, staleSequenceDetected } from "../sync/sqlite-installation-presence";
import type { RestorePending } from "./restore-pending";

export function storingEnrollmentCredentials({
  store,
  pending,
  database,
}: {
  store: (credentials: DeviceCredentials) => Promise<boolean>;
  pending: RestorePending;
  database: LocalDatabase | undefined;
}): (credentials: DeviceCredentials) => Promise<boolean> {
  return async (credentials) => {
    if (database === undefined) {
      return store(credentials);
    }
    const held = installationHeld(database);
    const stale = held && staleSequenceDetected(database);
    if (held && !stale) {
      return store(credentials);
    }
    const earlier = pending.deviceId();
    const earlierSetsAside = pending.setsAsideLiveDatabase();
    pending.begin(credentials.device_id, { setAsideLiveDatabase: stale });
    const stored = await store(credentials);
    if (!stored) {
      if (earlier === undefined) {
        pending.clear();
      } else {
        pending.begin(earlier, { setAsideLiveDatabase: earlierSetsAside });
      }
    }
    return stored;
  };
}

export function afterEnrollment({
  pending,
  restartCore,
  attemptRestore,
  syncNow,
}: {
  pending: RestorePending;
  restartCore: () => void;
  attemptRestore: () => void;
  syncNow: () => void;
}): void {
  if (pending.setsAsideLiveDatabase()) {
    restartCore();
    return;
  }
  attemptRestore();
  syncNow();
}
