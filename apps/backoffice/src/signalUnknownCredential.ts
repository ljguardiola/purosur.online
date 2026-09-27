export type UnknownCredentialSignal = {
  rpId: string;
  credentialId: string;
};

// `PublicKeyCredential.signalUnknownCredential` is a static WebAuthn Level 3 method no browser
// type (TypeScript's DOM lib, `@simplewebauthn/browser`) declares yet, so it's read off the global.
type SignalingPublicKeyCredential = {
  signalUnknownCredential?: (options: UnknownCredentialSignal) => Promise<undefined>;
};

export function signalUnknownCredential(signal: UnknownCredentialSignal): void {
  const credential = (globalThis as { PublicKeyCredential?: SignalingPublicKeyCredential })
    .PublicKeyCredential;
  if (!credential || typeof credential.signalUnknownCredential !== "function") {
    return;
  }
  try {
    // A browser might throw synchronously instead of rejecting, or return a non-promise:
    // `Promise.resolve` normalizes either so `.catch` and this try/catch both swallow it.
    void Promise.resolve(credential.signalUnknownCredential(signal)).catch(() => {});
  } catch {}
}
