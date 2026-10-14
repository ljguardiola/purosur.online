import { describe, expect, it } from "vitest";
import { resolveRegisterSnapshotsBucketConfig } from "./register-snapshots-bucket-config.js";

describe("resolveRegisterSnapshotsBucketConfig", () => {
  const COMPLETE = {
    REGISTER_SNAPSHOTS_BUCKET_ENDPOINT: "https://t3.storageapi.test",
    REGISTER_SNAPSHOTS_BUCKET_NAME: "register-snapshots-fictional",
    REGISTER_SNAPSHOTS_BUCKET_REGION: "auto",
    REGISTER_SNAPSHOTS_BUCKET_ACCESS_KEY_ID: "fictional-access-key-id",
    REGISTER_SNAPSHOTS_BUCKET_SECRET_ACCESS_KEY: "fictional-secret-access-key",
  };

  it("reads the snapshots bucket from its own variables", () => {
    expect(resolveRegisterSnapshotsBucketConfig(COMPLETE)).toEqual({
      endpoint: "https://t3.storageapi.test",
      bucket: "register-snapshots-fictional",
      region: "auto",
      accessKeyId: "fictional-access-key-id",
      secretAccessKey: "fictional-secret-access-key",
    });
  });

  it("ignores the updates bucket's variables", () => {
    expect(
      resolveRegisterSnapshotsBucketConfig({
        REGISTER_UPDATES_BUCKET_ENDPOINT: "https://t3.storageapi.test",
      }),
    ).toBeUndefined();
  });

  it("configures no bucket when none of its variables is set", () => {
    expect(resolveRegisterSnapshotsBucketConfig({})).toBeUndefined();
  });

  it.each(Object.keys(COMPLETE))("refuses a configuration missing %s", (name) => {
    const { [name]: _missing, ...partial } = COMPLETE as Record<string, string>;
    expect(() => resolveRegisterSnapshotsBucketConfig(partial)).toThrow(name);
  });
});
