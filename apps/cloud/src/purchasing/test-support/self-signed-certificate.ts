import { generateKeyPairSync } from "node:crypto";
import forge from "node-forge";

export interface SelfSignedCertificate {
  key: string;
  cert: string;
}

export function selfSignedCertificateFor(hostname: string): SelfSignedCertificate {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = forge.pki.publicKeyFromPem(
    publicKey.export({ type: "spki", format: "pem" }).toString(),
  );
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  certificate.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const subject = [{ name: "commonName", value: hostname }];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.setExtensions([
    { name: "basicConstraints", cA: true },
    { name: "subjectAltName", altNames: [{ type: 2, value: hostname }] },
  ]);
  const signingKey = forge.pki.privateKeyFromPem(
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  );
  certificate.sign(signingKey, forge.md.sha256.create());
  return {
    key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    cert: forge.pki.certificateToPem(certificate),
  };
}
