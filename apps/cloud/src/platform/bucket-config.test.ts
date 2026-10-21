import { describe, expect, it } from "vitest";
import { resolveBucketConfig } from "./bucket-config.js";

describe("resolveBucketConfig", () => {
  const COMPLETE = {
    EXAMPLE_BUCKET_ENDPOINT: "https://t3.storageapi.test",
    EXAMPLE_BUCKET_NAME: "example-fictional",
    EXAMPLE_BUCKET_REGION: "auto",
    EXAMPLE_BUCKET_ACCESS_KEY_ID: "fictional-access-key-id",
    EXAMPLE_BUCKET_SECRET_ACCESS_KEY: "fictional-secret-access-key",
  };

  it("is the bucket's endpoint, name, region and credentials read under its prefix", () => {
    expect(resolveBucketConfig(COMPLETE, "EXAMPLE")).toEqual({
      endpoint: "https://t3.storageapi.test",
      bucket: "example-fictional",
      region: "auto",
      accessKeyId: "fictional-access-key-id",
      secretAccessKey: "fictional-secret-access-key",
    });
  });

  it.each([
    ["none is set", {}],
    ["all are empty", Object.fromEntries(Object.keys(COMPLETE).map((name) => [name, ""]))],
  ])("is undefined when %s", (_case, env) => {
    expect(resolveBucketConfig(env, "EXAMPLE")).toBeUndefined();
  });

  it("ignores variables under another prefix", () => {
    const otherOnly: Record<string, string> = {
      OTHER_BUCKET_ENDPOINT: "https://t3.storageapi.test",
    };

    expect(resolveBucketConfig(otherOnly, "EXAMPLE")).toBeUndefined();
  });

  it.each(Object.keys(COMPLETE))("refuses to start without %s when the others are set", (name) => {
    const { [name]: _removed, ...partial } = COMPLETE as Record<string, string>;

    expect(() => resolveBucketConfig(partial, "EXAMPLE")).toThrow(`${name} must be set when`);
  });

  it("names the variable that is set when one is missing", () => {
    expect(() => resolveBucketConfig({ EXAMPLE_BUCKET_REGION: "auto" }, "EXAMPLE")).toThrow(
      "EXAMPLE_BUCKET_ENDPOINT must be set when EXAMPLE_BUCKET_REGION is set",
    );
  });
});
