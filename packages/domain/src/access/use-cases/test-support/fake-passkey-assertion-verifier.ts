import type {
  PasskeyAssertionVerification,
  PasskeyAssertionVerifier,
  VerifiablePasskey,
} from "../passkey-assertion-verifier.js";

export class FakePasskeyAssertionVerifier implements PasskeyAssertionVerifier {
  readonly verifiedPasskeys: VerifiablePasskey[] = [];
  private readonly verification: PasskeyAssertionVerification;

  constructor(verification: PasskeyAssertionVerification) {
    this.verification = verification;
  }

  async verify(passkey: VerifiablePasskey): Promise<PasskeyAssertionVerification> {
    this.verifiedPasskeys.push(structuredClone(passkey));
    return this.verification;
  }
}
