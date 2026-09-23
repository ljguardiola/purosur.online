import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  serializeSessionCookie,
} from "./session-cookie.js";

describe("serializeSessionCookie", () => {
  it("names the cookie with the __Host- prefix, which a browser only accepts from this host", () => {
    const header = serializeSessionCookie("a-raw-session-id");

    expect(header.startsWith("__Host-backoffice_session=a-raw-session-id;")).toBe(true);
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

describe("clearSessionCookie", () => {
  it("carries no session id under the session cookie's own name", () => {
    const header = clearSessionCookie();

    expect(header.startsWith(`${SESSION_COOKIE_NAME}=;`)).toBe(true);
  });

  it("is HttpOnly, Secure, SameSite=Lax, scoped to the whole origin, and expires immediately", () => {
    const header = clearSessionCookie();

    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).not.toContain("Domain=");
    expect(header).toContain("Max-Age=0");
  });
});

describe("readSessionCookie", () => {
  it("reads the raw session id back out of a Cookie header", () => {
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}=a-raw-session-id`)).toBe("a-raw-session-id");
  });

  it("finds the session cookie among several other cookies", () => {
    expect(readSessionCookie(`other=1; ${SESSION_COOKIE_NAME}=a-raw-session-id; another=2`)).toBe(
      "a-raw-session-id",
    );
  });

  it("ignores a same-named cookie without the __Host- prefix, whichever order the two arrive in", () => {
    expect(
      readSessionCookie("backoffice_session=shadow; __Host-backoffice_session=a-raw-session-id"),
    ).toBe("a-raw-session-id");
    expect(
      readSessionCookie("__Host-backoffice_session=a-raw-session-id; backoffice_session=shadow"),
    ).toBe("a-raw-session-id");
  });

  it("returns undefined when the session cookie's name arrives twice", () => {
    expect(
      readSessionCookie(
        "__Host-backoffice_session=planted; __Host-backoffice_session=a-raw-session-id",
      ),
    ).toBeUndefined();
  });

  it("returns undefined when only an unprefixed backoffice_session cookie was sent", () => {
    expect(readSessionCookie("backoffice_session=shadow")).toBeUndefined();
  });

  it("returns undefined when no Cookie header was sent", () => {
    expect(readSessionCookie(undefined)).toBeUndefined();
  });

  it("returns undefined when the session cookie is not among the ones sent", () => {
    expect(readSessionCookie("other=1")).toBeUndefined();
  });
});
