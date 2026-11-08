import type { DeviceCredentials } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { refreshKeysWhenAnnounced } from "./announced-key-refresh";

const key = (fill: number) => Buffer.alloc(32, fill).toString("base64");

function credentialsHolding(versions: number[]): DeviceCredentials {
  return {
    device_id: "a4b1",
    device_token: "prefix.secret",
    pepper: "cGVwcGVy",
    keys: {
      snapshot_key_versions: versions.map((version) => ({ version, key: key(version) })),
      contingency_ticket_key: { version: 1, key: key(9) },
      outbox_chain_key: key(8),
    },
  };
}

async function refreshWith(options: {
  announced: number | undefined;
  credentials: DeviceCredentials | undefined;
}) {
  let refreshes = 0;
  await refreshKeysWhenAnnounced(options.announced, {
    readCredentials: async () => options.credentials,
    refreshInstallationKeysNow: async () => {
      refreshes += 1;
      return { kind: "rotated" };
    },
  });
  return refreshes;
}

describe("refreshKeysWhenAnnounced", () => {
  it("refreshes the keys when the announced version is above the latest the register holds", async () => {
    expect(await refreshWith({ announced: 3, credentials: credentialsHolding([1, 2]) })).toBe(1);
  });

  it("holds the latest by version, whatever the order the keys are held in", async () => {
    expect(await refreshWith({ announced: 3, credentials: credentialsHolding([3, 1]) })).toBe(0);
  });

  it.each([2, 1])(
    "does not refresh when the announced version is %i, not above the held 2",
    async (announced) => {
      expect(await refreshWith({ announced, credentials: credentialsHolding([1, 2]) })).toBe(0);
    },
  );

  it("does not refresh when nothing was announced", async () => {
    expect(await refreshWith({ announced: undefined, credentials: credentialsHolding([1]) })).toBe(
      0,
    );
  });

  it("does not refresh a register that holds no credentials", async () => {
    expect(await refreshWith({ announced: 2, credentials: undefined })).toBe(0);
  });

  it("refreshes when the credentials hold no keys yet", async () => {
    const { keys: _keys, ...withoutKeys } = credentialsHolding([1]);

    expect(await refreshWith({ announced: 1, credentials: withoutKeys })).toBe(1);
  });
});
