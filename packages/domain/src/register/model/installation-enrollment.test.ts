import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SalesStopState } from "../../sync/index.js";
import { installationEnrollment } from "./installation-enrollment.js";

const STOPPED_BY_REVOCATION: SalesStopState = { stopped: true, reason: "installation_revoked" };
const NOT_STOPPED: SalesStopState = { stopped: false };

describe("installationEnrollment", () => {
  it("is not enrolled without credentials, whatever the local database holds", () => {
    fc.assert(
      fc.property(
        fc.option(fc.uuid(), { nil: undefined }),
        fc.constantFrom(STOPPED_BY_REVOCATION, NOT_STOPPED),
        (heldDeviceId, salesStop) => {
          expect(
            installationEnrollment({ credentialsDeviceId: undefined, heldDeviceId, salesStop }),
          ).toEqual({ kind: "not_enrolled" });
        },
      ),
    );
  });

  it("is revoked when the cloud revoked the installation of the credentials' device", () => {
    expect(
      installationEnrollment({
        credentialsDeviceId: "device-1",
        heldDeviceId: "device-1",
        salesStop: STOPPED_BY_REVOCATION,
      }),
    ).toEqual({ kind: "revoked" });
  });

  it.each(["event_history_broken", undefined] as const)(
    "is enrolled when the sales were stopped for another reason than a revocation: %s",
    (reason) => {
      expect(
        installationEnrollment({
          credentialsDeviceId: "device-1",
          heldDeviceId: "device-1",
          salesStop: { stopped: true, reason },
        }),
      ).toEqual({ kind: "enrolled" });
    },
  );

  it("is enrolled when the sales are not stopped", () => {
    expect(
      installationEnrollment({
        credentialsDeviceId: "device-1",
        heldDeviceId: "device-1",
        salesStop: NOT_STOPPED,
      }),
    ).toEqual({ kind: "enrolled" });
  });

  it("is enrolled when the credentials are of another device than the stopped database's", () => {
    expect(
      installationEnrollment({
        credentialsDeviceId: "device-2",
        heldDeviceId: "device-1",
        salesStop: STOPPED_BY_REVOCATION,
      }),
    ).toEqual({ kind: "enrolled" });
  });

  it("is enrolled when the database holds no device yet", () => {
    expect(
      installationEnrollment({
        credentialsDeviceId: "device-2",
        heldDeviceId: undefined,
        salesStop: STOPPED_BY_REVOCATION,
      }),
    ).toEqual({ kind: "enrolled" });
  });
});
