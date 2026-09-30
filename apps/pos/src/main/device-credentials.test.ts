import {
  closeSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  answerCoreCredentialsRequest,
  createDeviceCredentialsStore,
  credentialsFileAt,
  type DurableFileSystem,
  type SecretEncryption,
} from "./device-credentials";

const CREDENTIALS = {
  device_id: "5f2b7e0c-1d1b-4c43-9c55-0d8e3a1f2b44",
  device_token: "lookupprefix0000.secretpartofthetoken",
  pepper: "cGVwcGVycGVwcGVycGVwcGVycGVwcGVycGVwcGVy",
  token_received_at: "2026-09-29T12:00:00.000Z",
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

  it("reports no credentials before any were stored", () => {
    expect(storeIn(temporaryFolder()).isPresent()).toBe(false);
  });

  it("reads back the credentials it stored, even from a store opened afterwards", () => {
    const folder = temporaryFolder();
    storeIn(folder).store(CREDENTIALS);

    expect(storeIn(folder).read()).toEqual(CREDENTIALS);
  });

  it("reads credentials stored before their token's arrival was recorded", () => {
    const folder = temporaryFolder();
    const { token_received_at: _unrecorded, ...older } = CREDENTIALS;
    storeIn(folder).store(older);

    expect(storeIn(folder).read()).toEqual(older);
  });

  it("reads nothing before any credentials were stored", () => {
    expect(storeIn(temporaryFolder()).read()).toBeUndefined();
  });

  it("reads nothing from a file it can't decrypt", () => {
    const folder = temporaryFolder();
    writeFileSync(join(folder, "device-credentials.bin"), "garbage");
    const failingDecryption = {
      ...reversingEncryption,
      decryptString: () => {
        throw new Error("the data could not be decrypted");
      },
    };

    expect(storeIn(folder, failingDecryption).read()).toBeUndefined();
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

describe("replace", () => {
  const NEXT = { ...CREDENTIALS, device_token: "next.token" };

  it("swaps in the new credentials when the stored token is the one expected", () => {
    const folder = temporaryFolder();
    storeIn(folder).store(CREDENTIALS);

    expect(storeIn(folder).replace(CREDENTIALS.device_token, NEXT)).toBe("replaced");
    expect(storeIn(folder).read()).toEqual(NEXT);
  });

  it("leaves the credentials of a newer enrollment untouched when the token expected is gone", () => {
    const folder = temporaryFolder();
    const enrolledMeanwhile = { ...CREDENTIALS, device_id: "other", device_token: "other.token" };
    storeIn(folder).store(enrolledMeanwhile);

    expect(storeIn(folder).replace(CREDENTIALS.device_token, NEXT)).toBe("superseded");
    expect(storeIn(folder).read()).toEqual(enrolledMeanwhile);
  });

  it("counts absent credentials as superseded and stores nothing", () => {
    const folder = temporaryFolder();

    expect(storeIn(folder).replace(CREDENTIALS.device_token, NEXT)).toBe("superseded");
    expect(storeIn(folder).isPresent()).toBe(false);
  });

  it("says nothing was stored when the operating system can't encrypt", () => {
    const folder = temporaryFolder();
    storeIn(folder).store(CREDENTIALS);
    const store = storeIn(folder, { ...reversingEncryption, isEncryptionAvailable: () => false });

    expect(store.replace(CREDENTIALS.device_token, NEXT)).toBe("not_stored");
  });
});

describe("answerCoreCredentialsRequest", () => {
  it("answers a replace request with how it went, leaving newer credentials alone", () => {
    const store = storeIn(temporaryFolder());
    store.store(CREDENTIALS);
    const request = {
      type: "replace-device-credentials",
      request_id: "r6",
      expected_device_token: CREDENTIALS.device_token,
      credentials: { ...CREDENTIALS, device_token: "next.token" },
    } as const;

    expect(answerCoreCredentialsRequest(store, request)).toEqual({
      type: "device-credentials-replaced",
      request_id: "r6",
      outcome: "replaced",
    });
    expect(answerCoreCredentialsRequest(store, request)).toEqual({
      type: "device-credentials-replaced",
      request_id: "r6",
      outcome: "superseded",
    });
  });

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

  it("hands the core the stored credentials when it asks to read them", () => {
    const store = storeIn(temporaryFolder());
    store.store(CREDENTIALS);

    expect(
      answerCoreCredentialsRequest(store, {
        type: "device-credentials-read-request",
        request_id: "r4",
      }),
    ).toEqual({ type: "device-credentials-read", request_id: "r4", credentials: CREDENTIALS });
  });

  it("tells the core there are no credentials when it asks to read them and none are stored", () => {
    expect(
      answerCoreCredentialsRequest(storeIn(temporaryFolder()), {
        type: "device-credentials-read-request",
        request_id: "r4",
      }),
    ).toEqual({ type: "device-credentials-read", request_id: "r4" });
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

describe("credentialsFileAt durability", () => {
  function recordingFileSystem(failOn?: string, bytesPerWrite = Number.POSITIVE_INFINITY) {
    const calls: string[] = [];
    const written: Buffer[] = [];
    let nextDescriptor = 10;
    const descriptorPaths = new Map<number, string>();
    function record(call: string): void {
      calls.push(call);
      if (call === failOn) {
        throw new Error(`${call} failed`);
      }
    }
    const fileSystem: DurableFileSystem = {
      openSync: (path) => {
        const descriptor = nextDescriptor++;
        descriptorPaths.set(descriptor, path);
        record(`open ${path}`);
        return descriptor;
      },
      writeSync: (descriptor, contents) => {
        record(`write ${descriptorPaths.get(descriptor)}`);
        const chunk = contents.subarray(0, bytesPerWrite);
        written.push(chunk);
        return chunk.length;
      },
      fsyncSync: (descriptor) => record(`fsync ${descriptorPaths.get(descriptor)}`),
      closeSync: (descriptor) => record(`close ${descriptorPaths.get(descriptor)}`),
      renameSync: (from, to) => record(`rename ${from} ${to}`),
    };
    return { fileSystem, calls, written: () => Buffer.concat(written) };
  }

  it("flushes the temporary file before renaming it and the folder after, on Linux", () => {
    const { fileSystem, calls } = recordingFileSystem();

    credentialsFileAt("/data/device-credentials.bin", {
      fileSystem,
      platform: "linux",
    }).write(Buffer.from("secret"));

    expect(calls).toEqual([
      "open /data/device-credentials.bin.partial",
      "write /data/device-credentials.bin.partial",
      "fsync /data/device-credentials.bin.partial",
      "close /data/device-credentials.bin.partial",
      "rename /data/device-credentials.bin.partial /data/device-credentials.bin",
      "open /data",
      "fsync /data",
      "close /data",
    ]);
  });

  it("flushes the temporary file before renaming it but never opens the folder on Windows", () => {
    const { fileSystem, calls } = recordingFileSystem();

    credentialsFileAt("C:\\data\\device-credentials.bin", {
      fileSystem,
      platform: "win32",
    }).write(Buffer.from("secret"));

    expect(calls.map((call) => call.split(" ")[0])).toEqual([
      "open",
      "write",
      "fsync",
      "close",
      "rename",
    ]);
  });

  it("never renames a temporary file it failed to flush, and closes it", () => {
    const { fileSystem, calls } = recordingFileSystem("fsync /data/device-credentials.bin.partial");
    const file = credentialsFileAt("/data/device-credentials.bin", {
      fileSystem,
      platform: "linux",
    });

    expect(() => file.write(Buffer.from("secret"))).toThrow();
    expect(calls.some((call) => call.startsWith("rename"))).toBe(false);
    expect(calls.at(-1)).toBe("close /data/device-credentials.bin.partial");
  });

  it("writes every byte before renaming when the disk takes the contents in pieces", () => {
    const { fileSystem, calls, written } = recordingFileSystem(undefined, 2);

    credentialsFileAt("/data/device-credentials.bin", {
      fileSystem,
      platform: "linux",
    }).write(Buffer.from("secret"));

    expect(written().toString()).toBe("secret");
    expect(calls).toContain(
      "rename /data/device-credentials.bin.partial /data/device-credentials.bin",
    );
  });

  it("never renames a temporary file the disk stopped taking bytes for, and closes it", () => {
    const { fileSystem, calls } = recordingFileSystem(undefined, 0);
    const file = credentialsFileAt("/data/device-credentials.bin", {
      fileSystem,
      platform: "linux",
    });

    expect(() => file.write(Buffer.from("secret"))).toThrow();
    expect(calls.some((call) => call.startsWith("rename"))).toBe(false);
    expect(calls.at(-1)).toBe("close /data/device-credentials.bin.partial");
  });

  it("keeps the stored credentials when only the folder can't be flushed, and closes it", () => {
    const folder = temporaryFolder();
    const folderDescriptors = new Set<number>();
    const closed: number[] = [];
    const fileSystem: DurableFileSystem = {
      openSync: (path, flags) => {
        const descriptor = openSync(path, flags);
        if (path === folder) {
          folderDescriptors.add(descriptor);
        }
        return descriptor;
      },
      writeSync: (descriptor, contents) => writeSync(descriptor, contents),
      fsyncSync: (descriptor) => {
        if (folderDescriptors.has(descriptor)) {
          throw new Error("fsync of the folder failed");
        }
        fsyncSync(descriptor);
      },
      closeSync: (descriptor) => {
        closed.push(descriptor);
        closeSync(descriptor);
      },
      renameSync,
    };
    const store = createDeviceCredentialsStore({
      encryption: reversingEncryption,
      file: credentialsFileAt(join(folder, "device-credentials.bin"), {
        fileSystem,
        platform: "linux",
      }),
    });

    expect(store.store(CREDENTIALS)).toBe(true);
    expect(store.read()).toEqual(CREDENTIALS);
    expect(folderDescriptors.size).toBe(1);
    expect(closed).toEqual(expect.arrayContaining([...folderDescriptors]));
  });
});
