import type {
  PasskeyAssertionVerification,
  PasskeyAssertionVerifier,
  VerifiablePasskey,
} from "@purosur/domain/access/use-cases";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { WebAuthnConfig } from "./webauthn-config.js";

export interface WebAuthnAssertionVerifierInput {
  assertion: AuthenticationResponseJSON;
  expectedChallenge: string | ((challenge: string) => boolean | Promise<boolean>);
  config: WebAuthnConfig;
}

class WebAuthnAssertionVerifier implements PasskeyAssertionVerifier {
  private readonly input: WebAuthnAssertionVerifierInput;

  constructor(input: WebAuthnAssertionVerifierInput) {
    this.input = input;
  }

  async verify(passkey: VerifiablePasskey): Promise<PasskeyAssertionVerification> {
    const { assertion, expectedChallenge, config } = this.input;
    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin: config.expectedOrigin,
      expectedRPID: config.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, "base64url"),
        counter: passkey.counter,
        ...(passkey.transports ? { transports: passkey.transports } : {}),
      },
      requireUserVerification: true,
    }).catch(() => ({ verified: false as const }));
    if (!verification.verified) {
      return { verified: false };
    }
    return { verified: true, newCounter: verification.authenticationInfo.newCounter };
  }
}

export function webAuthnAssertionVerifier(
  input: WebAuthnAssertionVerifierInput,
): PasskeyAssertionVerifier {
  return new WebAuthnAssertionVerifier(input);
}
