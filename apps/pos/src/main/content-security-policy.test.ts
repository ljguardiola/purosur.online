import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./content-security-policy";

describe("buildContentSecurityPolicy", () => {
  it("restricts the default source to the application itself", () => {
    const policy = buildContentSecurityPolicy();

    expect(policy).toContain("default-src 'self'");
  });

  it("never allows a remote origin for script, style, font or image sources", () => {
    const policy = buildContentSecurityPolicy();
    const directives = Object.fromEntries(
      policy.split("; ").map((directive) => {
        const [name, ...value] = directive.split(" ");
        return [name, value.join(" ")];
      }),
    );

    expect(directives["script-src"]).toBe("'self'");
    expect(directives["style-src"]).toBe("'self'");
    expect(directives["font-src"]).toBe("'self'");
    expect(directives["img-src"]).toBe("'self'");
  });

  it("never allows inline script or style", () => {
    const policy = buildContentSecurityPolicy();

    expect(policy).not.toContain("unsafe-inline");
  });
});
