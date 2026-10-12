import { describe, expect, it } from "vitest";
import {
  registerReleaseEntrySchema,
  registerUpdateAnswerSchema,
  registerUpdateQuerySchema,
  registerVersionSchema,
  registerVersionText,
} from "./register-update.js";

const SHA512 = Buffer.alloc(64, 7).toString("base64");
const ENTRY = {
  version: "0.0.812",
  file: "Puro Sur Homologación Setup 0.0.812.exe",
  size: 123_456_789,
  sha512: SHA512,
};

describe("registerVersionSchema", () => {
  it("reads major, minor and patch as numbers", () => {
    expect(registerVersionSchema.parse("1.20.300")).toEqual({ major: 1, minor: 20, patch: 300 });
  });

  it.each([
    "1.2",
    "1.2.3.4",
    "01.2.3",
    "1.02.3",
    "1.2.03",
    "v1.2.3",
    "1.2.3-beta",
    "1.2.x",
    "-1.2.3",
    " 1.2.3",
    "1.2.3\n",
    "",
    "9007199254740992.0.0",
    "1.2.99999999999999999999",
  ])("refuses %j", (text) => {
    expect(registerVersionSchema.safeParse(text).success).toBe(false);
  });

  it("refuses what is not text", () => {
    expect(registerVersionSchema.safeParse(1).success).toBe(false);
  });
});

describe("registerVersionText", () => {
  it.each(["0.0.0", "0.0.812", "12.34.56"])("writes %s back as it was read", (text) => {
    expect(registerVersionText(registerVersionSchema.parse(text))).toBe(text);
  });
});

describe("registerUpdateQuerySchema", () => {
  it("reads the installed version", () => {
    expect(registerUpdateQuerySchema.parse({ installed_version: "0.0.811" })).toEqual({
      installed_version: { major: 0, minor: 0, patch: 811 },
    });
  });

  it("refuses a query without the installed version", () => {
    expect(registerUpdateQuerySchema.safeParse({}).success).toBe(false);
  });

  it("refuses an unknown parameter", () => {
    expect(
      registerUpdateQuerySchema.safeParse({ installed_version: "0.0.811", channel: "x" }).success,
    ).toBe(false);
  });

  it("refuses a malformed installed version", () => {
    expect(registerUpdateQuerySchema.safeParse({ installed_version: "latest" }).success).toBe(
      false,
    );
  });
});

describe("registerReleaseEntrySchema", () => {
  it("reads a published release with its version as numbers", () => {
    expect(registerReleaseEntrySchema.parse(ENTRY)).toEqual({
      ...ENTRY,
      version: { major: 0, minor: 0, patch: 812 },
    });
  });

  it.each(["Puro Sur Setup 0.0.812.exe", "a.exe", "Ñandú-1_2.exe", `${"a".repeat(196)}.exe`])(
    "accepts the file name %j",
    (file) => {
      expect(registerReleaseEntrySchema.safeParse({ ...ENTRY, file }).success).toBe(true);
    },
  );

  it.each([
    "../setup.exe",
    "dir/setup.exe",
    "dir\\setup.exe",
    "/setup.exe",
    "set..up.exe",
    "..exe",
    " setup.exe",
    ".hidden.exe",
    "setup.msi",
    "setup.exe.txt",
    "setup.exe\n",
    "",
    `${"a".repeat(197)}.exe`,
  ])("refuses the file name %j", (file) => {
    expect(registerReleaseEntrySchema.safeParse({ ...ENTRY, file }).success).toBe(false);
  });

  it.each([0, -1, 1.5, 2 ** 53, Number.NaN, "10"])("refuses the size %j", (size) => {
    expect(registerReleaseEntrySchema.safeParse({ ...ENTRY, size }).success).toBe(false);
  });

  it.each([
    ["too short", Buffer.alloc(63, 1).toString("base64")],
    ["too long", Buffer.alloc(65, 1).toString("base64")],
    ["not base64", `${"!".repeat(86)}==`],
    ["empty", ""],
  ])("refuses a digest that is %s", (_name, sha512) => {
    expect(registerReleaseEntrySchema.safeParse({ ...ENTRY, sha512 }).success).toBe(false);
  });

  it("refuses an unknown field", () => {
    expect(registerReleaseEntrySchema.safeParse({ ...ENTRY, notes: "x" }).success).toBe(false);
  });

  it("refuses a missing field", () => {
    const { size: _size, ...withoutSize } = ENTRY;

    expect(registerReleaseEntrySchema.safeParse(withoutSize).success).toBe(false);
  });
});

describe("registerUpdateAnswerSchema", () => {
  const available = {
    status: "available",
    version: "0.0.812",
    size: 123_456_789,
    sha512: SHA512,
    download_url: "https://bucket.example.com/Puro%20Sur%20Setup%200.0.812.exe?X-Amz-Signature=ab",
  };

  it("accepts being up to date", () => {
    expect(registerUpdateAnswerSchema.parse({ status: "up_to_date" })).toEqual({
      status: "up_to_date",
    });
  });

  it("accepts an available update", () => {
    expect(registerUpdateAnswerSchema.parse(available)).toEqual(available);
  });

  it("refuses a download over plain http", () => {
    expect(
      registerUpdateAnswerSchema.safeParse({
        ...available,
        download_url: "http://bucket.example.com/setup.exe",
      }).success,
    ).toBe(false);
  });

  it("refuses a download address that is not a URL", () => {
    expect(
      registerUpdateAnswerSchema.safeParse({ ...available, download_url: "setup.exe" }).success,
    ).toBe(false);
  });

  it("refuses a malformed version", () => {
    expect(registerUpdateAnswerSchema.safeParse({ ...available, version: "1.2" }).success).toBe(
      false,
    );
  });

  it("refuses a non-positive size", () => {
    expect(registerUpdateAnswerSchema.safeParse({ ...available, size: 0 }).success).toBe(false);
  });

  it("refuses a digest that is not 64 bytes", () => {
    expect(
      registerUpdateAnswerSchema.safeParse({
        ...available,
        sha512: Buffer.alloc(32, 1).toString("base64"),
      }).success,
    ).toBe(false);
  });

  it("refuses an unknown status", () => {
    expect(registerUpdateAnswerSchema.safeParse({ status: "later" }).success).toBe(false);
  });

  it("refuses an available update without its download address", () => {
    const { download_url: _url, ...withoutUrl } = available;

    expect(registerUpdateAnswerSchema.safeParse(withoutUrl).success).toBe(false);
  });
});
