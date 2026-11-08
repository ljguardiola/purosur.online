import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { installationEnrollment } from "./installation-enrollment.js";

describe("installationEnrollment", () => {
  it("is not enrolled without credentials, whatever the local database holds", () => {
    fc.assert(
      fc.property(
        fc.option(fc.uuid(), { nil: undefined }),
        fc.boolean(),
        (heldDeviceId, installationRevoked) => {
          expect(
            installationEnrollment({
              credentialsDeviceId: undefined,
              heldDeviceId,
              installationRevoked,
            }),
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
        installationRevoked: true,
      }),
    ).toEqual({ kind: "revoked" });
  });

  it("is enrolled when the installation of the credentials' device is not revoked", () => {
    expect(
      installationEnrollment({
        credentialsDeviceId: "device-1",
        heldDeviceId: "device-1",
        installationRevoked: false,
      }),
    ).toEqual({ kind: "enrolled" });
  });

  it("is enrolled when the credentials are of another device than the revoked database's", () => {
    expect(
      installationEnrollment({
        credentialsDeviceId: "device-2",
        heldDeviceId: "device-1",
        installationRevoked: true,
      }),
    ).toEqual({ kind: "enrolled" });
  });

  it("is enrolled when the database holds no device yet", () => {
    expect(
      installationEnrollment({
        credentialsDeviceId: "device-2",
        heldDeviceId: undefined,
        installationRevoked: true,
      }),
    ).toEqual({ kind: "enrolled" });
  });
});
