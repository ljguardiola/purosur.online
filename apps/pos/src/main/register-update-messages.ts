import type { RegisterUpdateAnswer, UpdateSafeMomentAnswer } from "@purosur/contracts";

// Main may import only types from packages/contracts, so it reads the cloud's answer and the
// core's with no library.

const VERSION_TEXT = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA512_BASE64 = /^[A-Za-z0-9+/]{85}[AQgw]==$/;

type Fields = Record<string, unknown>;

function fieldsOf(value: unknown): Fields | undefined {
  return typeof value === "object" && value !== null ? (value as Fields) : undefined;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function readRegisterUpdateAnswer(value: unknown): RegisterUpdateAnswer | undefined {
  const fields = fieldsOf(value);
  if (fields?.["status"] === "up_to_date") {
    return { status: "up_to_date" };
  }
  const { status, version, size, sha512, download_url } = fields ?? {};
  if (
    status === "available" &&
    typeof version === "string" &&
    VERSION_TEXT.test(version) &&
    typeof size === "number" &&
    Number.isSafeInteger(size) &&
    size > 0 &&
    typeof sha512 === "string" &&
    SHA512_BASE64.test(sha512) &&
    isHttpsUrl(download_url)
  ) {
    return { status, version, size, sha512, download_url };
  }
  return undefined;
}

export function readUpdateSafeMomentAnswer(value: unknown): UpdateSafeMomentAnswer | undefined {
  const fields = fieldsOf(value);
  const requestId = fields?.["request_id"];
  const safe = fields?.["safe"];
  if (
    fields?.["type"] === "update-safe-moment" &&
    typeof requestId === "string" &&
    typeof safe === "boolean"
  ) {
    return { type: "update-safe-moment", request_id: requestId, safe };
  }
  return undefined;
}
