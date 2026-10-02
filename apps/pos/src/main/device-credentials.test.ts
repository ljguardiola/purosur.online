import { describe, expect, it } from "vitest";
import {
  answerCoreCredentialsRequest,
  type CredentialsFile,
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
  keys: {
    snapshot_key_versions: [{ version: 1, key: "c25hcHNob3Qta2V5LW9uLWRpc2s=" }],
    contingency_ticket_key: { version: 1, key: "dGlja2V0LWtleS1vbi1kaXNr" },
    outbox_chain_key: "b3V0Ym94LWtleS1vbi1kaXNr",
  },
};

// Reverses the bytes, so a stored file never holds the plain text it was given.
const reversingEncryption: SecretEncryption = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(plain, "utf8").reverse(),
  decryptString: (encrypted) => Buffer.from(encrypted).reverse().toString("utf8"),
};

function memoryFile(initial?: string | Buffer): CredentialsFile {
  let contents = initial === undefined ? undefined : Buffer.from(initial);
  return {
    read: () => contents,
    write: (written) => {
      contents = Buffer.from(written);
    },
  };
}

function storeIn(file: CredentialsFile, encryption: SecretEncryption = reversingEncryption) {
  return createDeviceCredentialsStore({ encryption, file });
}

describe("createDeviceCredentialsStore", () => {
  it("stores the credentials through the operating system's encryption, never as plain text", () => {
    const file = memoryFile();

    expect(storeIn(file).store(CREDENTIALS)).toBe(true);

    const onDisk = file.read() ?? Buffer.alloc(0);
    expect(onDisk.toString("utf8")).not.toContain(CREDENTIALS.device_token);
    expect(onDisk.toString("utf8")).not.toContain(CREDENTIALS.pepper);
    expect(onDisk.toString("utf8")).not.toContain(CREDENTIALS.keys.outbox_chain_key);
    expect(onDisk.toString("utf8")).not.toContain(CREDENTIALS.keys.contingency_ticket_key.key);
    expect(JSON.parse(reversingEncryption.decryptString(onDisk))).toEqual(CREDENTIALS);
  });

  it("reports stored credentials as present, even to a store opened afterwards", () => {
    const file = memoryFile();
    storeIn(file).store(CREDENTIALS);

    expect(storeIn(file).isPresent()).toBe(true);
  });

  it("reports no credentials before any were stored", () => {
    expect(storeIn(memoryFile()).isPresent()).toBe(false);
  });

  it("reads back the credentials it stored, even from a store opened afterwards", () => {
    const file = memoryFile();
    storeIn(file).store(CREDENTIALS);

    expect(storeIn(file).read()).toEqual(CREDENTIALS);
  });

  it("reads credentials stored before their token's arrival was recorded", () => {
    const file = memoryFile();
    const { token_received_at: _unrecorded, ...older } = CREDENTIALS;
    storeIn(file).store(older);

    expect(storeIn(file).read()).toEqual(older);
  });

  it("reads credentials stored before the installation was handed its keys", () => {
    const file = memoryFile();
    const { keys: _notHandedOver, ...older } = CREDENTIALS;
    storeIn(file).store(older);

    expect(storeIn(file).read()).toEqual(older);
  });

  it("reads nothing before any credentials were stored", () => {
    expect(storeIn(memoryFile()).read()).toBeUndefined();
  });

  it("reads nothing from a file it can't decrypt", () => {
    const file = memoryFile("garbage");
    const failingDecryption = {
      ...reversingEncryption,
      decryptString: () => {
        throw new Error("the data could not be decrypted");
      },
    };

    expect(storeIn(file, failingDecryption).read()).toBeUndefined();
  });

  it("refuses to store anything when the operating system can't encrypt", () => {
    const file = memoryFile();
    const store = storeIn(file, { ...reversingEncryption, isEncryptionAvailable: () => false });

    expect(store.store(CREDENTIALS)).toBe(false);
    expect(storeIn(file).isPresent()).toBe(false);
  });

  it("reports a file it can't decrypt as no credentials", () => {
    const file = memoryFile("garbage");
    const failingDecryption = {
      ...reversingEncryption,
      decryptString: () => {
        throw new Error("the data could not be decrypted");
      },
    };

    expect(storeIn(file, failingDecryption).isPresent()).toBe(false);
  });

  it("reports a decrypted file that doesn't hold credentials as no credentials", () => {
    const file = memoryFile(reversingEncryption.encryptString(JSON.stringify({ device_id: "x" })));

    expect(storeIn(file).isPresent()).toBe(false);
  });

  it("answers false when the file can't be written", () => {
    const unwritable: CredentialsFile = {
      read: () => undefined,
      write: () => {
        throw new Error("the folder does not exist");
      },
    };

    expect(storeIn(unwritable).store(CREDENTIALS)).toBe(false);
  });

  it("replaces credentials stored before", () => {
    const file = memoryFile();
    storeIn(file).store({ ...CREDENTIALS, device_id: "previous" });

    storeIn(file).store(CREDENTIALS);

    expect(JSON.parse(reversingEncryption.decryptString(file.read() ?? Buffer.alloc(0)))).toEqual(
      CREDENTIALS,
    );
  });
});

describe("replace", () => {
  const NEXT = { ...CREDENTIALS, device_token: "next.token" };

  it("swaps in the new credentials when the stored token is the one expected", () => {
    const file = memoryFile();
    storeIn(file).store(CREDENTIALS);

    expect(storeIn(file).replace(CREDENTIALS.device_token, NEXT)).toBe("replaced");
    expect(storeIn(file).read()).toEqual(NEXT);
  });

  it("leaves the credentials of a newer enrollment untouched when the token expected is gone", () => {
    const file = memoryFile();
    const enrolledMeanwhile = { ...CREDENTIALS, device_id: "other", device_token: "other.token" };
    storeIn(file).store(enrolledMeanwhile);

    expect(storeIn(file).replace(CREDENTIALS.device_token, NEXT)).toBe("superseded");
    expect(storeIn(file).read()).toEqual(enrolledMeanwhile);
  });

  it("counts absent credentials as superseded and stores nothing", () => {
    const file = memoryFile();

    expect(storeIn(file).replace(CREDENTIALS.device_token, NEXT)).toBe("superseded");
    expect(storeIn(file).isPresent()).toBe(false);
  });

  it("says nothing was stored when the operating system can't encrypt", () => {
    const file = memoryFile();
    storeIn(file).store(CREDENTIALS);
    const store = storeIn(file, { ...reversingEncryption, isEncryptionAvailable: () => false });

    expect(store.replace(CREDENTIALS.device_token, NEXT)).toBe("not_stored");
  });
});

describe("answerCoreCredentialsRequest", () => {
  it("answers a replace request with how it went, leaving newer credentials alone", () => {
    const store = storeIn(memoryFile());
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
    const store = storeIn(memoryFile());

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
    const store = storeIn(memoryFile());
    store.store(CREDENTIALS);

    expect(
      answerCoreCredentialsRequest(store, { type: "device-credentials-request", request_id: "r2" }),
    ).toEqual({ type: "device-credentials-presence", request_id: "r2", present: true });
  });

  it("hands the core the stored credentials when it asks to read them", () => {
    const store = storeIn(memoryFile());
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
      answerCoreCredentialsRequest(storeIn(memoryFile()), {
        type: "device-credentials-read-request",
        request_id: "r4",
      }),
    ).toEqual({ type: "device-credentials-read", request_id: "r4" });
  });

  it.each([true, false])(
    "tells the core whether the operating system can encrypt credentials: %s",
    (available) => {
      const store = storeIn(memoryFile(), {
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

describe("credentialsFileAt", () => {
  function recordingFileSystem(failOn?: string, bytesPerWrite = Number.POSITIVE_INFINITY) {
    const calls: string[] = [];
    const files = new Map<string, Buffer>();
    let nextDescriptor = 10;
    const descriptorPaths = new Map<number, string>();
    function record(call: string): void {
      calls.push(call);
      if (call === failOn) {
        throw new Error(`${call} failed`);
      }
    }
    function pathOf(descriptor: number): string {
      return descriptorPaths.get(descriptor) ?? "";
    }
    const fileSystem: DurableFileSystem = {
      openSync: (path, flags) => {
        const descriptor = nextDescriptor++;
        descriptorPaths.set(descriptor, path);
        record(`open ${path}`);
        if (flags === "w") {
          files.set(path, Buffer.alloc(0));
        }
        return descriptor;
      },
      writeSync: (descriptor, contents) => {
        record(`write ${pathOf(descriptor)}`);
        const chunk = contents.subarray(0, bytesPerWrite);
        files.set(pathOf(descriptor), Buffer.concat([files.get(pathOf(descriptor)) ?? [], chunk]));
        return chunk.length;
      },
      fsyncSync: (descriptor) => record(`fsync ${pathOf(descriptor)}`),
      closeSync: (descriptor) => record(`close ${pathOf(descriptor)}`),
      renameSync: (from, to) => {
        record(`rename ${from} ${to}`);
        const moved = files.get(from);
        if (moved !== undefined) {
          files.set(to, moved);
          files.delete(from);
        }
      },
      readFileSync: (path) => {
        const contents = files.get(path);
        if (contents === undefined) {
          throw new Error(`${path} does not exist`);
        }
        return contents;
      },
    };
    return { fileSystem, calls };
  }

  it("reads back what it wrote", () => {
    const { fileSystem } = recordingFileSystem();
    const file = credentialsFileAt("/data/device-credentials.bin", {
      fileSystem,
      platform: "linux",
    });

    file.write(Buffer.from("secret"));

    expect(file.read()?.toString()).toBe("secret");
  });

  it("reads nothing before anything was written", () => {
    const { fileSystem } = recordingFileSystem();

    expect(
      credentialsFileAt("/data/device-credentials.bin", { fileSystem, platform: "linux" }).read(),
    ).toBeUndefined();
  });

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
    const { fileSystem, calls } = recordingFileSystem(undefined, 2);
    const file = credentialsFileAt("/data/device-credentials.bin", {
      fileSystem,
      platform: "linux",
    });

    file.write(Buffer.from("secret"));

    expect(file.read()?.toString()).toBe("secret");
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
    const { fileSystem, calls } = recordingFileSystem("fsync /data");
    const file = credentialsFileAt("/data/device-credentials.bin", {
      fileSystem,
      platform: "linux",
    });

    file.write(Buffer.from("secret"));

    expect(file.read()?.toString()).toBe("secret");
    expect(calls.at(-1)).toBe("close /data");
  });
});
