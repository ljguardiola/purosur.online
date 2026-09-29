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
  canStore(): boolean;
  store(credentials: DeviceCredentials): boolean;
  isPresent(): boolean;
  read(): DeviceCredentials | undefined;
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
  function read(): DeviceCredentials | undefined {
    const contents = deps.file.read();
    if (contents === undefined) {
      return undefined;
    }
    try {
      return readDeviceCredentials(JSON.parse(deps.encryption.decryptString(contents)));
    } catch {
      return undefined;
    }
  }

  return {
    canStore() {
      return deps.encryption.isEncryptionAvailable();
    },
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
      return read() !== undefined;
    },
    read,
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
  if (message.type === "device-credentials-read-request") {
    return {
      type: "device-credentials",
      request_id: message.request_id,
      credentials: store.read() ?? null,
    };
  }
  if (message.type === "device-credentials-storable-request") {
    return {
      type: "device-credentials-storable",
      request_id: message.request_id,
      storable: store.canStore(),
    };
  }
  return {
    type: "device-credentials-presence",
    request_id: message.request_id,
    present: store.isPresent(),
  };
}
