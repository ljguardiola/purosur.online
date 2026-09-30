import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTION_KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export interface InstallationKeyCipher {
  seal(key: string, purpose: string): string;
  open(sealed: string, purpose: string): string;
}

// The purpose is authenticated with the ciphertext, so a sealed key copied to another row (another
// register, version or installation) no longer opens.
export function installationKeyCipher(encryptionKey: Uint8Array): InstallationKeyCipher {
  if (encryptionKey.length !== ENCRYPTION_KEY_BYTES) {
    throw new Error(
      `the installation-keys encryption key must hold exactly ${ENCRYPTION_KEY_BYTES} bytes`,
    );
  }
  return {
    seal(key, purpose) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
      cipher.setAAD(Buffer.from(purpose));
      const encrypted = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
    },
    open(sealed, purpose) {
      try {
        const bytes = Buffer.from(sealed, "base64");
        const iv = bytes.subarray(0, IV_BYTES);
        const authTag = bytes.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
        const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv, {
          authTagLength: AUTH_TAG_BYTES,
        });
        decipher.setAAD(Buffer.from(purpose));
        decipher.setAuthTag(authTag);
        const encrypted = bytes.subarray(IV_BYTES + AUTH_TAG_BYTES);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
      } catch {
        throw new Error("an installation key could not be decrypted");
      }
    },
  };
}
