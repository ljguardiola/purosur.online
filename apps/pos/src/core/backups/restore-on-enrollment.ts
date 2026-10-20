import type { DeviceCredentials } from "@purosur/contracts";
import type { LocalDatabase } from "../platform/local-database";
import { installationHeld } from "../sync/sqlite-installation-presence";
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
    if (database === undefined || installationHeld(database)) {
      return store(credentials);
    }
    const earlier = pending.deviceId();
    pending.begin(credentials.device_id);
    const stored = await store(credentials);
    if (!stored) {
      if (earlier === undefined) {
        pending.clear();
      } else {
        pending.begin(earlier);
      }
    }
    return stored;
  };
}
