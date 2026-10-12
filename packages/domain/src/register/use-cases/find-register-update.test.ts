import { describe, expect, it } from "vitest";
import { findRegisterUpdate, type RegisterRelease } from "./find-register-update.js";
import { FakeRegisterReleases } from "./test-support/fake-register-releases.js";

const RELEASE: RegisterRelease = {
  version: { major: 0, minor: 0, patch: 812 },
  file: "Puro Sur Setup 0.0.812.exe",
  size: 123_456_789,
  sha512: "c2hhNTEy",
};

function find(published: RegisterRelease | undefined, installed: RegisterRelease["version"]) {
  return findRegisterUpdate(
    { releases: new FakeRegisterReleases(published) },
    { installedVersion: installed },
  );
}

describe("findRegisterUpdate", () => {
  it("is up to date when no release was published", async () => {
    expect(await find(undefined, { major: 0, minor: 0, patch: 1 })).toEqual({ kind: "up_to_date" });
  });

  it("is up to date when the published release is the installed version", async () => {
    expect(await find(RELEASE, RELEASE.version)).toEqual({ kind: "up_to_date" });
  });

  it("is up to date when the published release is older than the installed version", async () => {
    expect(await find(RELEASE, { major: 0, minor: 1, patch: 0 })).toEqual({ kind: "up_to_date" });
  });

  it("offers the published release when it is newer than the installed version", async () => {
    expect(await find(RELEASE, { major: 0, minor: 0, patch: 811 })).toEqual({
      kind: "available",
      release: RELEASE,
    });
  });
});
