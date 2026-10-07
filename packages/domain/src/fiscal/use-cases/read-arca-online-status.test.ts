import { describe, expect, it } from "vitest";
import { readArcaOnlineStatus } from "./read-arca-online-status.js";
import {
  FakeArcaReachabilityReader,
  FakeWsaaTokenReader,
} from "./test-support/fake-arca-online-status.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const SERVICE = "wsfe";
const FINGERPRINT = "AA:BB";

function secondsBefore(moment: Date, seconds: number): Date {
  return new Date(moment.getTime() - seconds * 1000);
}

function tokenExpiringAt(expiresAt: Date) {
  return { token: "t", sign: "s", issuedAt: secondsBefore(expiresAt, 43_200), expiresAt };
}

function read(
  setUp: (ports: { reachability: FakeArcaReachabilityReader; tokens: FakeWsaaTokenReader }) => void,
) {
  const reachability = new FakeArcaReachabilityReader();
  const tokens = new FakeWsaaTokenReader();
  setUp({ reachability, tokens });
  return {
    tokens,
    status: readArcaOnlineStatus(
      { reachability, tokens, clock: new ManualClock(NOW) },
      { service: SERVICE, certificateFingerprint: FINGERPRINT },
    ),
  };
}

describe("readArcaOnlineStatus", () => {
  it("reports ARCA reachable with the time of the last vitality check that succeeded", async () => {
    const probeOkAt = secondsBefore(NOW, 30);

    const { status } = read(({ reachability }) => {
      reachability.evidence = { lastVitalityCheckOkAt: probeOkAt, lastWsfeCallOkAt: null };
    });

    await expect(status).resolves.toMatchObject({ probeOkAt, reachable: true });
  });

  it("reports ARCA unreachable when the last vitality check is older than the horizon, still naming its time", async () => {
    const probeOkAt = secondsBefore(NOW, 91);

    const { status } = read(({ reachability }) => {
      reachability.evidence = { lastVitalityCheckOkAt: probeOkAt, lastWsfeCallOkAt: null };
    });

    await expect(status).resolves.toMatchObject({ probeOkAt, reachable: false });
  });

  it("reports ARCA unreachable with no probe time when no vitality check ever succeeded", async () => {
    const { status } = read(() => {});

    await expect(status).resolves.toMatchObject({ probeOkAt: null, reachable: false });
  });

  it("reports ARCA reachable on a recent successful call even when the last vitality check is old, without changing the probe time", async () => {
    const probeOkAt = secondsBefore(NOW, 600);

    const { status } = read(({ reachability }) => {
      reachability.evidence = {
        lastVitalityCheckOkAt: probeOkAt,
        lastWsfeCallOkAt: secondsBefore(NOW, 10),
      };
    });

    await expect(status).resolves.toMatchObject({ probeOkAt, reachable: true });
  });

  it("reports the token valid while it has not expired", async () => {
    const { status } = read(({ tokens }) => {
      tokens.seed(SERVICE, FINGERPRINT, tokenExpiringAt(new Date(NOW.getTime() + 1)));
    });

    await expect(status).resolves.toMatchObject({ tokenValid: true });
  });

  it("reports the token invalid once it expired", async () => {
    const { status } = read(({ tokens }) => {
      tokens.seed(SERVICE, FINGERPRINT, tokenExpiringAt(NOW));
    });

    await expect(status).resolves.toMatchObject({ tokenValid: false });
  });

  it("reports the token invalid when none was ever issued", async () => {
    const { status } = read(() => {});

    await expect(status).resolves.toMatchObject({ tokenValid: false });
  });

  it("reads the token of the service and certificate it is asked about", async () => {
    const { tokens, status } = read(({ tokens: seeded }) => {
      seeded.seed("other", FINGERPRINT, tokenExpiringAt(new Date(NOW.getTime() + 60_000)));
      seeded.seed(SERVICE, "CC:DD", tokenExpiringAt(new Date(NOW.getTime() + 60_000)));
    });

    await expect(status).resolves.toMatchObject({ tokenValid: false });
    expect(tokens.reads).toEqual([{ service: SERVICE, certificateFingerprint: FINGERPRINT }]);
  });
});
