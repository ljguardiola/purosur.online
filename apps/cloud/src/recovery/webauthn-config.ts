export interface WebAuthnConfig {
  rpName: string;
  rpID: string;
  expectedOrigin: string;
}

const RP_NAME = "Puro Sur";

/**
 * Derives the WebAuthn relying party config from the same `BACKOFFICE_ORIGIN`
 * `.railway/railway.ts` already resolves per environment, instead of adding a parallel env
 * mechanism: the relying party id is that origin's host, and the expected origin is the origin
 * itself.
 */
export function resolveWebAuthnConfig(backofficeOrigin: string): WebAuthnConfig {
  return {
    rpName: RP_NAME,
    rpID: new URL(backofficeOrigin).hostname,
    expectedOrigin: backofficeOrigin,
  };
}
