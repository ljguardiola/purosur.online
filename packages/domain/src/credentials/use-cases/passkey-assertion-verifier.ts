export interface VerifiablePasskey {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
}

export type PasskeyAssertionVerification =
  | { verified: true; newCounter: number }
  | { verified: false };

export interface PasskeyAssertionVerifier {
  verify(passkey: VerifiablePasskey): Promise<PasskeyAssertionVerification>;
}
