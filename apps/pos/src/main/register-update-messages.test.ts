import { describe, expect, it } from "vitest";
import { readRegisterUpdateAnswer, readUpdateSafeMomentAnswer } from "./register-update-messages";

const SHA512 = `${"A".repeat(86)}==`;

const AVAILABLE = {
  status: "available",
  version: "1.4.2",
  size: 90_000_000,
  sha512: SHA512,
  download_url: "https://updates.example.com/register-updates/1.4.2/Puro Sur Setup 1.4.2.exe",
};

describe("readRegisterUpdateAnswer", () => {
  it("reads that the register is up to date", () => {
    expect(readRegisterUpdateAnswer({ status: "up_to_date" })).toEqual({ status: "up_to_date" });
  });

  it("reads the release the cloud offers", () => {
    expect(readRegisterUpdateAnswer(AVAILABLE)).toEqual(AVAILABLE);
  });

  it.each([
    ["not an object", "available"],
    ["null", null],
    ["an unknown status", { status: "later" }],
    ["a version with more than three parts", { ...AVAILABLE, version: "1.4.2.1" }],
    ["a version that could walk out of the folder", { ...AVAILABLE, version: "..\\1.4" }],
    ["a size that is not a positive whole number", { ...AVAILABLE, size: 0 }],
    ["a fractional size", { ...AVAILABLE, size: 10.5 }],
    ["a size given as text", { ...AVAILABLE, size: "100" }],
    ["a digest that is not base64 of 64 bytes", { ...AVAILABLE, sha512: "abc" }],
    ["a download address that is not https", { ...AVAILABLE, download_url: "http://x.test/a.exe" }],
    ["a download address that is not an address", { ...AVAILABLE, download_url: "installer.exe" }],
    ["no download address", { ...AVAILABLE, download_url: undefined }],
  ])("reads nothing from an answer with %s", (_case, answer) => {
    expect(readRegisterUpdateAnswer(answer)).toBeUndefined();
  });
});

describe("readUpdateSafeMomentAnswer", () => {
  it("reads the core's answer", () => {
    const answer = { type: "update-safe-moment", request_id: "r1", safe: false };

    expect(readUpdateSafeMomentAnswer(answer)).toEqual(answer);
  });

  it.each([
    ["another message type", { type: "core-ready" }],
    ["no request id", { type: "update-safe-moment", safe: true }],
    ["a safe flag that is not a boolean", { type: "update-safe-moment", request_id: "r", safe: 1 }],
    ["not an object", 7],
  ])("reads nothing from %s", (_case, message) => {
    expect(readUpdateSafeMomentAnswer(message)).toBeUndefined();
  });
});
