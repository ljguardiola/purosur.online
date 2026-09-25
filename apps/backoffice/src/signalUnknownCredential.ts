export type UnknownCredentialSignal = {
  rpId: string;
  credentialId: string;
};

// `PublicKeyCredential.signalUnknownCredential` is a static WebAuthn Level 3 method no browser
// type (TypeScript's bundled DOM lib, `@simplewebauthn/browser`) declares yet, so this type is
// kept local to the one place that reads it off the global.
type SignalingPublicKeyCredential = {
  signalUnknownCredential?: (options: UnknownCredentialSignal) => Promise<undefined>;
};

/**
 * Asks the current device to forget a passkey the cloud never saved, through the WebAuthn Signal
 * API. Fire-and-forget: a browser or passkey manager without the API is left exactly as it is, and
 * any rejection from one that does have it is swallowed, so this can never delay or change what
 * the calling screen shows.
 */
export function signalUnknownCredential(signal: UnknownCredentialSignal): void {
  const credential = (globalThis as { PublicKeyCredential?: SignalingPublicKeyCredential })
    .PublicKeyCredential;
  if (!credential || typeof credential.signalUnknownCredential !== "function") {
    return;
  }
  try {
    // A browser's implementation might throw synchronously instead of returning a rejected
    // promise, or return something that isn't a promise at all: `Promise.resolve` normalizes
    // either into a promise this can `.catch`, and the surrounding try/catch swallows a
    // synchronous throw the same way `.catch` swallows an asynchronous rejection.
    void Promise.resolve(credential.signalUnknownCredential(signal)).catch(() => {});
  } catch {}
}
