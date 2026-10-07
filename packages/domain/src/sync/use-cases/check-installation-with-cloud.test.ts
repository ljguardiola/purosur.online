import { describe, expect, it } from "vitest";
import { checkInstallationWithCloud } from "./check-installation-with-cloud.js";
import {
  FakeCloudInstallationCheck,
  FakeLocalInstallation,
} from "./test-support/fake-local-installation.js";

describe("checking the installation with the cloud", () => {
  it("records the installation as revoked when the cloud says it was revoked", async () => {
    const installation = new FakeLocalInstallation();
    const cloud = new FakeCloudInstallationCheck({ kind: "revoked" });

    expect(await checkInstallationWithCloud({ installation, cloud })).toEqual({
      kind: "revoked",
    });
    expect(cloud.checks).toBe(1);
    expect(installation.revocationsRecorded).toBe(1);
  });

  it("records nothing when the cloud says the installation is in service", async () => {
    const installation = new FakeLocalInstallation();
    const cloud = new FakeCloudInstallationCheck({ kind: "in_service" });

    expect(await checkInstallationWithCloud({ installation, cloud })).toEqual({
      kind: "in_service",
    });
    expect(installation.revoked).toBe(false);
  });

  it("records nothing and reports the failure when the cloud's answer is not a standing", async () => {
    const installation = new FakeLocalInstallation();
    const cloud = new FakeCloudInstallationCheck({ kind: "failed", failure: "token refused" });

    expect(await checkInstallationWithCloud({ installation, cloud })).toEqual({
      kind: "failed",
      failure: "token refused",
    });
    expect(installation.revoked).toBe(false);
  });
});
