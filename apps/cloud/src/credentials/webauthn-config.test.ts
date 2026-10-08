import { describe, expect, it } from "vitest";
import { resolveWebAuthnConfig } from "./webauthn-config.js";

describe("resolveWebAuthnConfig", () => {
  it("derives the relying party id from the backoffice origin's host", () => {
    const config = resolveWebAuthnConfig("https://staging.purosur.online");

    expect(config.rpID).toBe("staging.purosur.online");
  });

  it("uses the backoffice origin itself as the expected origin", () => {
    const config = resolveWebAuthnConfig("https://staging.purosur.online");

    expect(config.expectedOrigin).toBe("https://staging.purosur.online");
  });

  it("names the relying party Puro Sur", () => {
    const config = resolveWebAuthnConfig("https://staging.purosur.online");

    expect(config.rpName).toBe("Puro Sur");
  });

  it("drops a non-default port from the relying party id, keeping it in the expected origin", () => {
    const config = resolveWebAuthnConfig("http://localhost:3000");

    expect(config.rpID).toBe("localhost");
    expect(config.expectedOrigin).toBe("http://localhost:3000");
  });
});
