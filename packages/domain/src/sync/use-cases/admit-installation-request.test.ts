import { describe, expect, it } from "vitest";
import {
  INSTALLATION_REQUEST_LIMITS,
  INSTALLATION_REQUEST_WINDOW_MS,
  type LimitedEndpoint,
} from "../model/installation-request-limit.js";
import { admitInstallationRequest } from "./admit-installation-request.js";
import { FakeRequestAdmission } from "./test-support/fake-request-admission.js";

const DEVICE = "device-1";
const OTHER_DEVICE = "device-2";
const NOW = new Date("2026-10-01T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function admitting(
  admission: FakeRequestAdmission,
  endpoint: LimitedEndpoint,
  deviceId = DEVICE,
) {
  return admitInstallationRequest(
    { admission, clock: { now: () => NOW } },
    { deviceId, endpoint },
  );
}

function fill(
  admission: FakeRequestAdmission,
  endpoint: LimitedEndpoint,
  count: number,
  at = minutesAgo(1),
  deviceId = DEVICE,
) {
  for (let index = 0; index < count; index += 1) {
    admission.admitted.push({ deviceId, endpoint, at });
  }
}

describe("admitting a request of an installation", () => {
  it.each(["push", "pull", "health_check"] as const)(
    "admits a %s request below its limit and records it",
    async (endpoint) => {
      const admission = new FakeRequestAdmission();

      const outcome = await admitting(admission, endpoint);

      expect(outcome).toEqual({ kind: "admitted" });
      expect(admission.admittedAt(DEVICE, endpoint)).toEqual([NOW]);
    },
  );

  it("locks the installation's attempts of the endpoint before reading them", async () => {
    const admission = new FakeRequestAdmission();

    await admitting(admission, "pull");

    expect(admission.calls[0]).toBe("lockRequestAttempts device-1 pull");
    expect(admission.calls.indexOf("admittedRequests device-1 pull")).toBeGreaterThan(0);
  });

  it.each(["push", "pull", "health_check"] as const)(
    "refuses a %s request at its limit, telling when the oldest counted one leaves the window, and records nothing",
    async (endpoint) => {
      const admission = new FakeRequestAdmission();
      fill(admission, endpoint, INSTALLATION_REQUEST_LIMITS[endpoint] - 1);
      fill(admission, endpoint, 1, minutesAgo(40));

      const outcome = await admitting(admission, endpoint);

      expect(outcome).toEqual({ kind: "rate_limited", retryAfterSeconds: 20 * 60 });
      expect(admission.admittedAt(DEVICE, endpoint)).toHaveLength(
        INSTALLATION_REQUEST_LIMITS[endpoint],
      );
      expect(admission.calls.filter((call) => call.startsWith("recordAdmittedRequest"))).toEqual(
        [],
      );
      expect(admission.calls.filter((call) => call.startsWith("forgetRequestsThrough"))).toEqual(
        [],
      );
    },
  );

  it("counts each endpoint on its own", async () => {
    const admission = new FakeRequestAdmission();
    fill(admission, "push", INSTALLATION_REQUEST_LIMITS.push);

    const outcome = await admitting(admission, "pull");

    expect(outcome).toEqual({ kind: "admitted" });
  });

  it("counts each installation on its own", async () => {
    const admission = new FakeRequestAdmission();
    fill(admission, "push", INSTALLATION_REQUEST_LIMITS.push, minutesAgo(1), OTHER_DEVICE);

    const outcome = await admitting(admission, "push");

    expect(outcome).toEqual({ kind: "admitted" });
  });

  it("does not count the requests that already left the window", async () => {
    const admission = new FakeRequestAdmission();
    fill(admission, "push", INSTALLATION_REQUEST_LIMITS.push, minutesAgo(61));

    const outcome = await admitting(admission, "push");

    expect(outcome).toEqual({ kind: "admitted" });
  });

  it("forgets the installation's requests of that endpoint that left the window once it admits one", async () => {
    const admission = new FakeRequestAdmission();
    const leftTheWindow = new Date(NOW.getTime() - INSTALLATION_REQUEST_WINDOW_MS);
    fill(admission, "push", 2, leftTheWindow);
    fill(admission, "push", 1, minutesAgo(59));
    fill(admission, "pull", 1, minutesAgo(90));
    fill(admission, "push", 1, minutesAgo(90), OTHER_DEVICE);

    await admitting(admission, "push");

    expect(admission.admittedAt(DEVICE, "push")).toEqual([minutesAgo(59), NOW]);
    expect(admission.admittedAt(DEVICE, "pull")).toEqual([minutesAgo(90)]);
    expect(admission.admittedAt(OTHER_DEVICE, "push")).toEqual([minutesAgo(90)]);
  });

  it("leaves nothing behind when recording fails", async () => {
    const admission = new FakeRequestAdmission();
    admission.failRecording = true;
    fill(admission, "push", 1, minutesAgo(90));

    await expect(admitting(admission, "push")).rejects.toThrow("the request could not be recorded");

    expect(admission.admittedAt(DEVICE, "push")).toEqual([minutesAgo(90)]);
  });
});
