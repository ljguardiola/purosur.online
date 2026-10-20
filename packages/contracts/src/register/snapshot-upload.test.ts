import { describe, expect, it } from "vitest";
import { snapshotUploadAnswerSchema, snapshotUploadBodySchema } from "./snapshot-upload.js";

const BODY = {
  generation_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  size: 4096,
  sha256: "ab".repeat(32),
  key_version: 2,
  last_device_seq: 41,
};

describe("snapshotUploadBodySchema", () => {
  it("reads a declaration", () => {
    expect(snapshotUploadBodySchema.parse(BODY)).toEqual(BODY);
  });

  it("reads a generation id written in uppercase as lowercase", () => {
    expect(
      snapshotUploadBodySchema.parse({ ...BODY, generation_id: BODY.generation_id.toUpperCase() })
        .generation_id,
    ).toBe(BODY.generation_id);
  });

  it.each([
    ["a generation id that is not a uuid", { generation_id: "generation-1" }],
    ["a size of zero", { size: 0 }],
    ["a fractional size", { size: 10.5 }],
    ["a negative size", { size: -1 }],
    ["a size beyond the safe integers", { size: 2 ** 53 }],
    ["an uppercase hash", { sha256: "AB".repeat(32) }],
    ["a short hash", { sha256: "ab".repeat(31) }],
    ["a long hash", { sha256: "ab".repeat(33) }],
    ["a hash that is not hexadecimal", { sha256: "zz".repeat(32) }],
    ["a key version of zero", { key_version: 0 }],
    ["a fractional key version", { key_version: 1.5 }],
    ["a negative last device sequence", { last_device_seq: -1 }],
    ["a fractional last device sequence", { last_device_seq: 1.5 }],
    ["a last device sequence beyond the safe integers", { last_device_seq: 2 ** 53 }],
  ])("refuses %s", (_name, override) => {
    expect(snapshotUploadBodySchema.safeParse({ ...BODY, ...override }).success).toBe(false);
  });

  it("reads a declaration of a generation taken before the register recorded any change", () => {
    expect(snapshotUploadBodySchema.parse({ ...BODY, last_device_seq: 0 }).last_device_seq).toBe(0);
  });

  it.each(["generation_id", "size", "sha256", "key_version", "last_device_seq"])(
    "requires %s",
    (field) => {
      const { [field]: _omitted, ...rest } = BODY as Record<string, unknown>;
      expect(snapshotUploadBodySchema.safeParse(rest).success).toBe(false);
    },
  );

  it("refuses a field it does not know", () => {
    expect(snapshotUploadBodySchema.safeParse({ ...BODY, object_key: "x" }).success).toBe(false);
  });
});

describe("snapshotUploadAnswerSchema", () => {
  const ANSWER = {
    upload_url: "https://bucket.example.test/snapshots/r/g?X-Amz-Signature=abc",
    required_headers: { "x-amz-meta-key-version": "2" },
    expires_at: "2026-10-14T15:15:00.000Z",
    current_key_version: 3,
  };

  it("reads the upload URL, the headers to send, when it expires and the register's current key version", () => {
    expect(snapshotUploadAnswerSchema.parse(ANSWER)).toEqual(ANSWER);
  });

  it.each([
    ["that is not https", "http://bucket.example.test"],
    ["whose scheme ends in https", "xhttps://bucket.example.test"],
    ["whose scheme starts with https", "httpsx://bucket.example.test"],
  ])("refuses an upload URL %s", (_name, upload_url) => {
    expect(snapshotUploadAnswerSchema.safeParse({ ...ANSWER, upload_url }).success).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["fractional", 1.5],
  ])("refuses a current key version that is %s", (_name, current_key_version) => {
    expect(snapshotUploadAnswerSchema.safeParse({ ...ANSWER, current_key_version }).success).toBe(
      false,
    );
  });

  it("refuses an expiry that is not an instant", () => {
    expect(
      snapshotUploadAnswerSchema.safeParse({ ...ANSWER, expires_at: "tomorrow" }).success,
    ).toBe(false);
  });
});
