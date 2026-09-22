import { describe, expect, it } from "vitest";
import {
  readSessionCookie,
  SESSION_COOKIE_NAME,
  serializeSessionCookie,
} from "./session-cookie.js";

describe("serializeSessionCookie", () => {
  it("carries the raw session id under the session cookie's own name", () => {
    const header = serializeSessionCookie("a-raw-session-id");

    expect(header.startsWith(`${SESSION_COOKIE_NAME}=a-raw-session-id;`)).toBe(true);
  });

  it("is HttpOnly, Secure, SameSite=Lax and scoped to the whole origin", () => {
    const header = serializeSessionCookie("a-raw-session-id");

    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).not.toContain("Domain=");
  });
});

describe("readSessionCookie", () => {
  it("reads the raw session id back out of a Cookie header", () => {
    expect(readSessionCookie("backoffice_session=a-raw-session-id")).toBe("a-raw-session-id");
  });

  it("finds the session cookie among several other cookies", () => {
    expect(readSessionCookie(`other=1; ${SESSION_COOKIE_NAME}=a-raw-session-id; another=2`)).toBe(
      "a-raw-session-id",
    );
  });

  it("returns undefined when no Cookie header was sent", () => {
    expect(readSessionCookie(undefined)).toBeUndefined();
  });

  it("returns undefined when the session cookie is not among the ones sent", () => {
    expect(readSessionCookie("other=1")).toBeUndefined();
  });
});
