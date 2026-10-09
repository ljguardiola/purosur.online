import { describe, expect, it } from "vitest";
import {
  BACKOFFICE_REQUEST_WINDOW_MS,
  BACKOFFICE_SESSION_REQUEST_LIMIT,
  BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT,
  backofficeRequestWindowStart,
} from "./backoffice-request-rate-limits.js";

const NOW = new Date("2026-10-02T12:00:00.000Z");

describe("backoffice request rate limits", () => {
  it("accepts 600 requests per session and 1800 per source address each hour", () => {
    expect(BACKOFFICE_REQUEST_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(BACKOFFICE_SESSION_REQUEST_LIMIT).toBe(600);
    expect(BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT).toBe(1800);
  });
});

describe("backofficeRequestWindowStart", () => {
  it("counts requests from one hour before now", () => {
    expect(backofficeRequestWindowStart(NOW)).toEqual(new Date("2026-10-02T11:00:00.000Z"));
  });
});
