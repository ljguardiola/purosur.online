import { normalizePemNewlines } from "../platform/pem-newlines.js";

export type ArcaCredentialsResult =
  | { kind: "ready"; certificatePem: string; privateKeyPem: string }
  | { kind: "refused"; reason: string };

export function arcaCredentialsOf(env: Record<string, string | undefined>): ArcaCredentialsResult {
  const certificate = env["ARCA_CERTIFICATE"];
  const privateKey = env["ARCA_PRIVATE_KEY"];
  if (!certificate) {
    return { kind: "refused", reason: "ARCA_CERTIFICATE is not set" };
  }
  if (!privateKey) {
    return { kind: "refused", reason: "ARCA_PRIVATE_KEY is not set" };
  }
  return {
    kind: "ready",
    certificatePem: normalizePemNewlines(certificate),
    privateKeyPem: normalizePemNewlines(privateKey),
  };
}
