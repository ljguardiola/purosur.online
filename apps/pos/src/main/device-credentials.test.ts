import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  answerCoreCredentialsRequest,
  createDeviceCredentialsStore,
  credentialsFileAt,
  type SecretEncryption,
} from "./device-credentials";

const CREDENTIALS = {
  device_id: "5f2b7e0c-1d1b-4c43-9c55-0d8e3a1f2b44",
  device_token: "lookupprefix0000.secretpartofthetoken",
  pepper: "cGVwcGVycGVwcGVycGVwcGVycGVwcGVycGVwcGVy",
};

const temporaryFolders: string[] = [];

afterEach(() => {
  for (const folder of temporaryFolders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

function temporaryFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "device-credentials-"));
  temporaryFolders.push(folder);
  return folder;
}

// Reverses the bytes, so a stored file never holds the plain text it was given.
const reversingEncryption: SecretEncryption = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(plain, "utf8").reverse(),
  decryptString: (encrypted) => Buffer.from(encrypted).reverse().toString("utf8"),
};

function storeIn(folder: string, encryption: SecretEncryption = reversingEncryption) {
  return createDeviceCredentialsStore({
    encryption,
    file: credentialsFileAt(join(folder, "device-credentials.bin")),
  });
}

describe("createDeviceCredentialsStore", () => {
  it("stores the credentials through the operating system's encryption, never as plain text", () => {
    const folder = temporaryFolder();

    expect(storeIn(folder).store(CREDENTIALS)).toBe(true);

    const onDisk = readFileSync(join(folder, "device-credentials.bin"));
    expect(onDisk.toString("utf8")).not.toContain(CREDENTIALS.device_token);
    expect(onDisk.toString("utf8")).not.toContain(CREDENTIALS.pepper);
    expect(JSON.parse(reversingEncryption.decryptString(onDisk))).toEqual(CREDENTIALS);
  });

  it("reports stored credentials as present, even to a store opened afterwards", () => {
    const folder = temporaryFolder();
    storeIn(folder).store(CREDENTIALS);

    expect(storeIn(folder).isPresent()).toBe(true);
  });

  it("reads back the credentials it stored, even from a store opened afterwards", () => {
    const folder = temporaryFolder();
    storeIn(folder).store(CREDENTIALS);

    expect(storeIn(folder).read()).toEqual(CREDENTIALS);
  });

  it("reads no credentials from a file it can't decrypt", () => {
    const folder = temporaryFolder();
    writeFileSync(join(folder, "device-credentials.bin"), "not encrypted");

    expect(
      storeIn(folder, {
        ...reversingEncryption,
        decryptString: () => {
          throw new Error("cannot decrypt");
        },
      }).read(),
    ).toBeUndefined();
  });

  it("reports no credentials before any were stored", () => {
    expect(storeIn(temporaryFolder()).isPresent()).toBe(false);
  });

  it("refuses to store anything when the operating system can't encrypt", () => {
    const folder = temporaryFolder();
    const store = storeIn(folder, { ...reversingEncryption, isEncryptionAvailable: () => false });

    expect(store.store(CREDENTIALS)).toBe(false);
    expect(storeIn(folder).isPresent()).toBe(false);
  });

  it("reports a file it can't decrypt as no credentials", () => {
    const folder = temporaryFolder();
    writeFileSync(join(folder, "device-credentials.bin"), "garbage");
    const failingDecryption = {
      ...reversingEncryption,
      decryptString: () => {
        throw new Error("the data could not be decrypted");
      },
    };

    expect(storeIn(folder, failingDecryption).isPresent()).toBe(false);
  });

  it("reports a decrypted file that doesn't hold credentials as no credentials", () => {
    const folder = temporaryFolder();
    writeFileSync(
      join(folder, "device-credentials.bin"),
      reversingEncryption.encryptString(JSON.stringify({ device_id: "x" })),
    );

    expect(storeIn(folder).isPresent()).toBe(false);
  });

  it("answers false when the file can't be written", () => {
    const folder = temporaryFolder();
    const store = createDeviceCredentialsStore({
      encryption: reversingEncryption,
      file: credentialsFileAt(join(folder, "missing-folder", "device-credentials.bin")),
    });

    expect(store.store(CREDENTIALS)).toBe(false);
  });

  it("replaces credentials stored before", () => {
    const folder = temporaryFolder();
    storeIn(folder).store({ ...CREDENTIALS, device_id: "previous" });

    storeIn(folder).store(CREDENTIALS);

    const onDisk = readFileSync(join(folder, "device-credentials.bin"));
    expect(JSON.parse(reversingEncryption.decryptString(onDisk))).toEqual(CREDENTIALS);
  });
});

describe("answerCoreCredentialsRequest", () => {
  it("stores the credentials the core hands over and says whether it did", () => {
    const store = storeIn(temporaryFolder());

    expect(
      answerCoreCredentialsRequest(store, {
        type: "store-device-credentials",
        request_id: "r1",
        credentials: CREDENTIALS,
      }),
    ).toEqual({ type: "device-credentials-stored", request_id: "r1", stored: true });
    expect(store.isPresent()).toBe(true);
  });

  it("tells the core whether credentials are present, never the credentials themselves", () => {
    const store = storeIn(temporaryFolder());
    store.store(CREDENTIALS);

    expect(
      answerCoreCredentialsRequest(store, { type: "device-credentials-request", request_id: "r2" }),
    ).toEqual({ type: "device-credentials-presence", request_id: "r2", present: true });
  });

  it("hands the core the stored credentials when it asks for them", () => {
    const store = storeIn(temporaryFolder());
    store.store(CREDENTIALS);

    expect(
      answerCoreCredentialsRequest(store, {
        type: "device-credentials-read-request",
        request_id: "r4",
      }),
    ).toEqual({ type: "device-credentials", request_id: "r4", credentials: CREDENTIALS });
  });

  it("tells the core it holds no credentials when none are stored", () => {
    expect(
      answerCoreCredentialsRequest(storeIn(temporaryFolder()), {
        type: "device-credentials-read-request",
        request_id: "r4",
      }),
    ).toEqual({ type: "device-credentials", request_id: "r4", credentials: null });
  });

  it.each([true, false])(
    "tells the core whether the operating system can encrypt credentials: %s",
    (available) => {
      const store = storeIn(temporaryFolder(), {
        ...reversingEncryption,
        isEncryptionAvailable: () => available,
      });

      expect(
        answerCoreCredentialsRequest(store, {
          type: "device-credentials-storable-request",
          request_id: "r3",
        }),
      ).toEqual({ type: "device-credentials-storable", request_id: "r3", storable: available });
    },
  );
});
