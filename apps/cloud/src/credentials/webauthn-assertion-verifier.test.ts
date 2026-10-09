import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { WebAuthnEmulator } from "nid-webauthn-emulator";
import { describe, expect, it } from "vitest";
import { webAuthnAssertionVerifier } from "./webauthn-assertion-verifier.js";
import { resolveWebAuthnConfig } from "./webauthn-config.js";

const ORIGIN = "https://staging.purosur.online";
const CONFIG = resolveWebAuthnConfig(ORIGIN);

// The emulator's bundled types don't match `@simplewebauthn/server`'s one-for-one, so values cross as JSON.
function overTheWire(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

async function registeredPasskey(emulator: WebAuthnEmulator) {
  const options = await generateRegistrationOptions({
    rpName: CONFIG.rpName,
    rpID: CONFIG.rpID,
    userName: "ana@example.test",
  });
  const credential = emulator.createJSON(ORIGIN, overTheWire(options));
  const verified = await verifyRegistrationResponse({
    response: overTheWire(credential),
    expectedChallenge: options.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: CONFIG.rpID,
  });
  if (!verified.registrationInfo) {
    throw new Error("test setup: the registration did not verify");
  }
  const { credential: registered } = verified.registrationInfo;
  return {
    credentialId: registered.id,
    publicKey: Buffer.from(registered.publicKey).toString("base64url"),
    counter: registered.counter,
    transports: registered.transports ?? null,
  };
}

async function assertionFor(emulator: WebAuthnEmulator) {
  const options = await generateAuthenticationOptions({
    rpID: CONFIG.rpID,
    userVerification: "required",
  });
  const assertion: AuthenticationResponseJSON = overTheWire(
    emulator.getJSON(ORIGIN, overTheWire(options)),
  );
  return { assertion, challenge: options.challenge };
}

describe("webAuthnAssertionVerifier", () => {
  it("verifies an assertion of the passkey and answers its new counter", async () => {
    const emulator = new WebAuthnEmulator();
    const passkey = await registeredPasskey(emulator);
    const { assertion, challenge } = await assertionFor(emulator);

    const verification = await webAuthnAssertionVerifier({
      assertion,
      expectedChallenge: challenge,
      config: CONFIG,
    }).verify(passkey);

    const signedCounter = Buffer.from(
      assertion.response.authenticatorData,
      "base64url",
    ).readUInt32BE(33);
    expect(signedCounter).toBeGreaterThan(passkey.counter);
    expect(verification).toEqual({ verified: true, newCounter: signedCounter });
  });

  it("accepts the challenge when the expectation says it is live", async () => {
    const emulator = new WebAuthnEmulator();
    const passkey = await registeredPasskey(emulator);
    const { assertion } = await assertionFor(emulator);

    const verification = await webAuthnAssertionVerifier({
      assertion,
      expectedChallenge: () => true,
      config: CONFIG,
    }).verify(passkey);

    expect(verification.verified).toBe(true);
  });

  it("does not verify when the expectation says the challenge is not live", async () => {
    const emulator = new WebAuthnEmulator();
    const passkey = await registeredPasskey(emulator);
    const { assertion } = await assertionFor(emulator);

    const verification = await webAuthnAssertionVerifier({
      assertion,
      expectedChallenge: () => false,
      config: CONFIG,
    }).verify(passkey);

    expect(verification).toEqual({ verified: false });
  });

  it("does not verify an assertion of another challenge", async () => {
    const emulator = new WebAuthnEmulator();
    const passkey = await registeredPasskey(emulator);
    const { assertion } = await assertionFor(emulator);

    const verification = await webAuthnAssertionVerifier({
      assertion,
      expectedChallenge: "another-challenge",
      config: CONFIG,
    }).verify(passkey);

    expect(verification).toEqual({ verified: false });
  });

  it("does not verify an assertion made for another origin", async () => {
    const emulator = new WebAuthnEmulator();
    const passkey = await registeredPasskey(emulator);
    const { assertion, challenge } = await assertionFor(emulator);

    const verification = await webAuthnAssertionVerifier({
      assertion,
      expectedChallenge: challenge,
      config: resolveWebAuthnConfig("https://other.purosur.online"),
    }).verify(passkey);

    expect(verification).toEqual({ verified: false });
  });

  it("does not verify an assertion whose authenticator data was altered after signing", async () => {
    const emulator = new WebAuthnEmulator();
    const passkey = await registeredPasskey(emulator);
    const { assertion, challenge } = await assertionFor(emulator);
    const altered = Buffer.from(assertion.response.authenticatorData, "base64url");
    altered[altered.length - 1] = (altered[altered.length - 1] ?? 0) ^ 0xff;

    const verification = await webAuthnAssertionVerifier({
      assertion: {
        ...assertion,
        response: { ...assertion.response, authenticatorData: altered.toString("base64url") },
      },
      expectedChallenge: challenge,
      config: CONFIG,
    }).verify(passkey);

    expect(verification).toEqual({ verified: false });
  });

  it("does not verify a malformed assertion", async () => {
    const emulator = new WebAuthnEmulator();
    const passkey = await registeredPasskey(emulator);
    const { assertion, challenge } = await assertionFor(emulator);

    const verification = await webAuthnAssertionVerifier({
      assertion: { ...assertion, response: { ...assertion.response, signature: "" } },
      expectedChallenge: challenge,
      config: CONFIG,
    }).verify(passkey);

    expect(verification).toEqual({ verified: false });
  });
});
