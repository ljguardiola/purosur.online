import { describe, expect, it } from "vitest";
import { resolveRegisterUpdatesBucketConfig } from "./register-updates-bucket-config.js";

describe("resolveRegisterUpdatesBucketConfig", () => {
  it("reads the updates bucket from its own variables", () => {
    expect(
      resolveRegisterUpdatesBucketConfig({
        REGISTER_UPDATES_BUCKET_ENDPOINT: "https://t3.storageapi.test",
        REGISTER_UPDATES_BUCKET_NAME: "register-updates-fictional",
        REGISTER_UPDATES_BUCKET_REGION: "auto",
        REGISTER_UPDATES_BUCKET_ACCESS_KEY_ID: "fictional-access-key-id",
        REGISTER_UPDATES_BUCKET_SECRET_ACCESS_KEY: "fictional-secret-access-key",
      }),
    ).toEqual({
      endpoint: "https://t3.storageapi.test",
      bucket: "register-updates-fictional",
      region: "auto",
      accessKeyId: "fictional-access-key-id",
      secretAccessKey: "fictional-secret-access-key",
    });
  });

  it("ignores the snapshots bucket's variables", () => {
    const snapshotsOnly: Record<string, string> = {
      REGISTER_SNAPSHOTS_BUCKET_ENDPOINT: "https://t3.storageapi.test",
    };

    expect(resolveRegisterUpdatesBucketConfig(snapshotsOnly)).toBeUndefined();
  });
});
