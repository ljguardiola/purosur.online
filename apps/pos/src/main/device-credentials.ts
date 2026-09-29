import { readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  type DeviceCredentials,
  type DeviceCredentialsAnswer,
  type DeviceCredentialsRequest,
  readDeviceCredentials,
} from "../shared/device-credentials-messages";

// Electron's safeStorage, which encrypts with the operating system's own secret store (DPAPI on
// Windows); only main can reach it.
export interface SecretEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface CredentialsFile {
  read(): Buffer | undefined;
  write(contents: Buffer): void;
}

export interface DeviceCredentialsStore {
  store(credentials: DeviceCredentials): boolean;
  isPresent(): boolean;
}

export function credentialsFileAt(path: string): CredentialsFile {
  return {
    read() {
      try {
        return readFileSync(path);
      } catch {
        return undefined;
      }
    },
    // Written beside the file and renamed over it, so a crash mid-write never leaves half a file.
    write(contents) {
      const partial = `${path}.partial`;
      writeFileSync(partial, contents);
      renameSync(partial, path);
    },
  };
}

export function createDeviceCredentialsStore(deps: {
  encryption: SecretEncryption;
  file: CredentialsFile;
}): DeviceCredentialsStore {
  return {
    store(credentials) {
      if (!deps.encryption.isEncryptionAvailable()) {
        return false;
      }
      try {
        deps.file.write(deps.encryption.encryptString(JSON.stringify(credentials)));
        return true;
      } catch {
        return false;
      }
    },
    isPresent() {
      const contents = deps.file.read();
      if (contents === undefined) {
        return false;
      }
      try {
        return (
          readDeviceCredentials(JSON.parse(deps.encryption.decryptString(contents))) !== undefined
        );
      } catch {
        return false;
      }
    },
  };
}

export function answerCoreCredentialsRequest(
  store: DeviceCredentialsStore,
  message: DeviceCredentialsRequest,
): DeviceCredentialsAnswer {
  if (message.type === "store-device-credentials") {
    return {
      type: "device-credentials-stored",
      request_id: message.request_id,
      stored: store.store(message.credentials),
    };
  }
  return {
    type: "device-credentials-presence",
    request_id: message.request_id,
    present: store.isPresent(),
  };
}
