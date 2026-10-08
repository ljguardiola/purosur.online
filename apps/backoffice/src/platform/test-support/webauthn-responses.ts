import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";

export function registrationResponse(id: string): RegistrationResponseJSON {
  return {
    id,
    rawId: id,
    type: "public-key",
    clientExtensionResults: {},
    response: { clientDataJSON: "client-data", attestationObject: "attestation" },
  };
}

export function authenticationResponse(id: string): AuthenticationResponseJSON {
  return {
    id,
    rawId: id,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: "client-data",
      authenticatorData: "authenticator",
      signature: "signature",
    },
  };
}
