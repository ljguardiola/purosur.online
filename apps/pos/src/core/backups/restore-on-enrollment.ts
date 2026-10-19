import type { DeviceCredentials } from "@purosur/contracts";
import type { RestorePending } from "./restore-pending";

export function storingEnrollmentCredentials({
  store,
  pending,
  freshDatabase,
}: {
  store: (credentials: DeviceCredentials) => Promise<boolean>;
  pending: RestorePending;
  freshDatabase: boolean;
}): (credentials: DeviceCredentials) => Promise<boolean> {
  return async (credentials) => {
    if (!freshDatabase) {
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
