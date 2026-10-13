import { describe, expect, it } from "vitest";
import { resolveRegisterUpdatesBucketConfig } from "./register-updates-bucket-config.js";

describe("resolveRegisterUpdatesBucketConfig", () => {
  const COMPLETE = {
    REGISTER_UPDATES_BUCKET_ENDPOINT: "https://t3.storageapi.test",
    REGISTER_UPDATES_BUCKET_NAME: "register-updates-fictional",
    REGISTER_UPDATES_BUCKET_REGION: "auto",
    REGISTER_UPDATES_BUCKET_ACCESS_KEY_ID: "fictional-access-key-id",
    REGISTER_UPDATES_BUCKET_SECRET_ACCESS_KEY: "fictional-secret-access-key",
  };

  it("is the bucket's endpoint, name, region and credentials when all are set", () => {
    expect(resolveRegisterUpdatesBucketConfig(COMPLETE)).toEqual({
      endpoint: "https://t3.storageapi.test",
      bucket: "register-updates-fictional",
      region: "auto",
      accessKeyId: "fictional-access-key-id",
      secretAccessKey: "fictional-secret-access-key",
    });
  });

  it.each([
    ["none is set", {}],
    ["all are empty", Object.fromEntries(Object.keys(COMPLETE).map((name) => [name, ""]))],
  ])("is undefined when %s", (_case, env) => {
    expect(resolveRegisterUpdatesBucketConfig(env)).toBeUndefined();
  });

  it.each(Object.keys(COMPLETE))("refuses to start without %s when the others are set", (name) => {
    const { [name]: _removed, ...partial } = COMPLETE as Record<string, string>;

    expect(() => resolveRegisterUpdatesBucketConfig(partial)).toThrow(name);
  });
});
