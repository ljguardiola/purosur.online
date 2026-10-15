import { describe, expect, it } from "vitest";
import { offsiteDumpManifestSchema } from "./offsite-dump-manifest.js";

const manifest = {
  night: "2026-10-14",
  sizeBytes: 123_456,
  sha256: "a".repeat(64),
};

function isAccepted(body: unknown): boolean {
  return offsiteDumpManifestSchema.safeParse(body).success;
}

describe("offsiteDumpManifestSchema", () => {
  it("accepts the night, the encrypted dump's size and its SHA-256", () => {
    expect(offsiteDumpManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it("accepts an empty dump", () => {
    expect(isAccepted({ ...manifest, sizeBytes: 0 })).toBe(true);
  });

  it.each(["2026-13-01", "2026-10-14T06:00:00Z", "yesterday", ""])(
    "refuses the night %j",
    (night) => {
      expect(isAccepted({ ...manifest, night })).toBe(false);
    },
  );

  it.each([-1, 1.5, "10"])("refuses the size %j", (sizeBytes) => {
    expect(isAccepted({ ...manifest, sizeBytes })).toBe(false);
  });

  it.each(["", "a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64)])(
    "refuses the hash %j",
    (sha256) => {
      expect(isAccepted({ ...manifest, sha256 })).toBe(false);
    },
  );

  it.each(["night", "sizeBytes", "sha256"])("refuses a manifest without %s", (field) => {
    const { [field]: _removed, ...rest } = manifest as Record<string, unknown>;
    expect(isAccepted(rest)).toBe(false);
  });

  it("refuses a field the manifest does not define", () => {
    expect(isAccepted({ ...manifest, extra: true })).toBe(false);
  });
});
