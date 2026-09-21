import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./content-security-policy";

function parseDirectives(policy: string): Record<string, string> {
  return Object.fromEntries(
    policy.split("; ").map((directive) => {
      const [name, ...value] = directive.split(" ");
      return [name, value.join(" ")];
    }),
  );
}

describe("buildContentSecurityPolicy", () => {
  it("restricts the default source to the application itself", () => {
    const policy = buildContentSecurityPolicy();

    expect(policy).toContain("default-src 'self'");
  });

  it("never allows a remote origin for script, style, font or image sources", () => {
    const directives = parseDirectives(buildContentSecurityPolicy());

    expect(directives["script-src"]).toBe("'self'");
    expect(directives["style-src"]).toBe("'self'");
    expect(directives["font-src"]).toBe("'self'");
    expect(directives["img-src"]).toBe("'self'");
    expect(directives["connect-src"]).toBe("'self'");
  });

  it("never allows inline script or style", () => {
    const policy = buildContentSecurityPolicy();

    expect(policy).not.toContain("unsafe-inline");
  });

  it("forbids being framed by any other page when sent as a response header", () => {
    const directives = parseDirectives(buildContentSecurityPolicy());

    expect(directives["frame-ancestors"]).toBe("'none'");
  });

  describe("for a meta element in the page itself", () => {
    it("carries the same strict directives as the response header", () => {
      const header = parseDirectives(buildContentSecurityPolicy());
      const { "frame-ancestors": _framing, ...headerWithoutFraming } = header;

      expect(parseDirectives(buildContentSecurityPolicy({ delivery: "meta" }))).toEqual(
        headerWithoutFraming,
      );
    });

    it("leaves out frame-ancestors, which browsers ignore in a meta element", () => {
      const policy = buildContentSecurityPolicy({ delivery: "meta" });

      expect(policy).not.toContain("frame-ancestors");
    });

    it("never allows inline script or style", () => {
      const policy = buildContentSecurityPolicy({ delivery: "meta" });

      expect(policy).not.toContain("unsafe-inline");
    });
  });

  describe("while serving the interface from the local development server", () => {
    const devServerUrl = "http://localhost:5173/";

    it("allows the inline script and style the development server injects", () => {
      const directives = parseDirectives(buildContentSecurityPolicy({ devServerUrl }));

      expect(directives["script-src"]).toBe("'self' 'unsafe-inline'");
      expect(directives["style-src"]).toBe("'self' 'unsafe-inline'");
    });

    it("allows the hot-reload socket of that exact server and nothing else remote", () => {
      const directives = parseDirectives(buildContentSecurityPolicy({ devServerUrl }));

      expect(directives["connect-src"]).toBe("'self' ws://localhost:5173");
      expect(directives["font-src"]).toBe("'self'");
      expect(directives["img-src"]).toBe("'self'");
    });

    it("uses a secure socket when the development server is served over https", () => {
      const directives = parseDirectives(
        buildContentSecurityPolicy({ devServerUrl: "https://localhost:5173/" }),
      );

      expect(directives["connect-src"]).toBe("'self' wss://localhost:5173");
    });
  });
});
