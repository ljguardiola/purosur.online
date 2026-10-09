export interface WebAuthnConfig {
  rpName: string;
  rpID: string;
  expectedOrigin: string;
}

const RP_NAME = "Puro Sur";

export function resolveWebAuthnConfig(backofficeOrigin: string): WebAuthnConfig {
  return {
    rpName: RP_NAME,
    rpID: new URL(backofficeOrigin).hostname,
    expectedOrigin: backofficeOrigin,
  };
}
