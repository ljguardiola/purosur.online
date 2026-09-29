import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import {
  type CredentialsReplacement,
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
  replace(expectedDeviceToken: string, credentials: DeviceCredentials): CredentialsReplacement;
  read(): DeviceCredentials | undefined;
  isPresent(): boolean;
}

export interface DurableFileSystem {
  openSync(path: string, flags: string): number;
  writeSync(descriptor: number, contents: Buffer): unknown;
  fsyncSync(descriptor: number): void;
  closeSync(descriptor: number): void;
  renameSync(from: string, to: string): void;
}

const nodeFileSystem: DurableFileSystem = {
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
};

function withOpenFile(
  fileSystem: DurableFileSystem,
  path: string,
  flags: string,
  use: (descriptor: number) => void,
): void {
  const descriptor = fileSystem.openSync(path, flags);
  try {
    use(descriptor);
  } finally {
    fileSystem.closeSync(descriptor);
  }
}

export function credentialsFileAt(
  path: string,
  options: { fileSystem?: DurableFileSystem; platform?: NodeJS.Platform } = {},
): CredentialsFile {
  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const platform = options.platform ?? process.platform;
  return {
    read() {
      try {
        return readFileSync(path);
      } catch {
        return undefined;
      }
    },
    // Written beside the file and renamed over it, so a crash mid-write never leaves half a file;
    // flushed before the rename and the folder after it, so a power cut can't leave the rename
    // undone or the new file empty.
    write(contents) {
      const partial = `${path}.partial`;
      withOpenFile(fileSystem, partial, "w", (descriptor) => {
        fileSystem.writeSync(descriptor, contents);
        fileSystem.fsyncSync(descriptor);
      });
      fileSystem.renameSync(partial, path);
      // Windows can't open a folder to flush it, and NTFS journals the rename itself.
      if (platform !== "win32") {
        withOpenFile(fileSystem, dirname(path), "r", (descriptor) =>
          fileSystem.fsyncSync(descriptor),
        );
      }
    },
  };
}

export function createDeviceCredentialsStore(deps: {
  encryption: SecretEncryption;
  file: CredentialsFile;
}): DeviceCredentialsStore {
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
    read() {
      const contents = deps.file.read();
      if (contents === undefined) {
        return undefined;
      }
      try {
        return readDeviceCredentials(JSON.parse(deps.encryption.decryptString(contents)));
      } catch {
        return undefined;
      }
    },
    replace(expectedDeviceToken, credentials) {
      if (this.read()?.device_token !== expectedDeviceToken) {
        return "superseded";
      }
      return this.store(credentials) ? "replaced" : "not_stored";
    },
    isPresent() {
      return this.read() !== undefined;
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
  if (message.type === "replace-device-credentials") {
    return {
      type: "device-credentials-replaced",
      request_id: message.request_id,
      outcome: store.replace(message.expected_device_token, message.credentials),
    };
  }
  if (message.type === "device-credentials-storable-request") {
    return {
      type: "device-credentials-storable",
      request_id: message.request_id,
      storable: store.canStore(),
    };
  }
  if (message.type === "device-credentials-read-request") {
    const credentials = store.read();
    return credentials === undefined
      ? { type: "device-credentials-read", request_id: message.request_id }
      : { type: "device-credentials-read", request_id: message.request_id, credentials };
  }
  return {
    type: "device-credentials-presence",
    request_id: message.request_id,
    present: store.isPresent(),
  };
}
