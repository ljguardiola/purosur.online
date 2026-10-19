import type { DeviceCredentials } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { RestorePending } from "./restore-pending";
import { storingEnrollmentCredentials } from "./restore-on-enrollment";

const CREDENTIALS: DeviceCredentials = {
  device_id: "device-new",
  device_token: "prefix.secret",
  pepper: "cGVwcGVy",
  token_received_at: "2026-10-19T12:00:00.000Z",
};

class FakePending implements RestorePending {
  device: string | undefined;
  pendingNow: boolean;
  events: string[] = [];

  constructor(device?: string) {
    this.device = device;
    this.pendingNow = device !== undefined;
  }

  isPending = () => this.pendingNow;
  deviceId = () => this.device;
  begin = (deviceId: string) => {
    this.events.push(`begin ${deviceId}`);
    this.pendingNow = true;
    this.device = deviceId;
  };
  clear = () => {
    this.events.push("clear");
    this.pendingNow = false;
    this.device = undefined;
  };
}

function storing(pending: FakePending, freshDatabase: boolean, stored = true) {
  return storingEnrollmentCredentials({
    store: async () => {
      pending.events.push("store");
      return stored;
    },
    pending,
    freshDatabase,
  });
}

describe("storing the credentials of an enrollment", () => {
  it("begins a restore for the new installation before the credentials are stored, on a fresh database", async () => {
    const pending = new FakePending();

    const result = await storing(pending, true)(CREDENTIALS);

    expect(result).toBe(true);
    expect(pending.events).toEqual(["begin device-new", "store"]);
    expect(pending.deviceId()).toBe("device-new");
  });

  it("begins no restore on a database that already held an installation", async () => {
    const pending = new FakePending();

    const result = await storing(pending, false)(CREDENTIALS);

    expect(result).toBe(true);
    expect(pending.events).toEqual(["store"]);
    expect(pending.isPending()).toBe(false);
  });

  it("is no longer pending when the credentials could not be stored", async () => {
    const pending = new FakePending();

    const result = await storing(pending, true, false)(CREDENTIALS);

    expect(result).toBe(false);
    expect(pending.isPending()).toBe(false);
  });

  it("keeps the restore an earlier enrollment began when the new credentials could not be stored", async () => {
    const pending = new FakePending("device-earlier");

    await storing(pending, true, false)(CREDENTIALS);

    expect(pending.deviceId()).toBe("device-earlier");
  });
});
