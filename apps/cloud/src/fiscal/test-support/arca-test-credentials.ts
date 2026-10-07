import { generateKeyPairSync, X509Certificate } from "node:crypto";
import { FICTIONAL_CERTIFICATE_CUIT } from "@purosur/domain/fiscal/test-support";
import forge from "node-forge";

export interface ArcaTestCredentials {
  certificatePem: string;
  privateKeyPem: string;
  fingerprint: string;
}

export function generateArcaTestCredentials(): ArcaTestCredentials {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = forge.pki.publicKeyFromPem(publicKey);
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2026-01-01T00:00:00Z");
  certificate.validity.notAfter = new Date("2126-01-01T00:00:00Z");
  const subject = [
    { name: "commonName", value: "comercio-de-prueba" },
    { name: "serialNumber", value: `CUIT ${FICTIONAL_CERTIFICATE_CUIT.replaceAll("-", "")}` },
  ];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.sign(forge.pki.privateKeyFromPem(privateKey), forge.md.sha256.create());
  const certificatePem = forge.pki.certificateToPem(certificate);
  return {
    certificatePem,
    privateKeyPem: privateKey,
    fingerprint: new X509Certificate(certificatePem).fingerprint256,
  };
}
