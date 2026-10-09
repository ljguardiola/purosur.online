import type {
  PasskeyRegistrationChallengeWire,
  RecoveryRegistrationOptionsWire,
  SessionAuthenticationOptionsWire,
  SessionAuthorizationOptionsWire,
} from "@purosur/contracts";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { expectTypeOf, test } from "vitest";

test("the creation options the cloud sends are what the browser's WebAuthn call takes", () => {
  expectTypeOf<
    PasskeyRegistrationChallengeWire["passkey_registration_options"]
  >().toExtend<PublicKeyCredentialCreationOptionsJSON>();
  expectTypeOf<
    RecoveryRegistrationOptionsWire["passkey_registration_options"]
  >().toExtend<PublicKeyCredentialCreationOptionsJSON>();
});

test("the request options the cloud sends are what the browser's WebAuthn call takes", () => {
  expectTypeOf<
    SessionAuthenticationOptionsWire["passkey_authentication_options"]
  >().toExtend<PublicKeyCredentialRequestOptionsJSON>();
  expectTypeOf<
    SessionAuthorizationOptionsWire["authorization_options"]
  >().toExtend<PublicKeyCredentialRequestOptionsJSON>();
});
