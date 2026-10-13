import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CoreStatus } from "./core-status-broadcast";
import { createRegisterUpdater, type UpdateResponse } from "./register-update";

const INSTALLER = Buffer.from("fictional installer bytes".repeat(40));
const DIGEST = createHash("sha512").update(INSTALLER).digest("base64");
const CLOUD = "https://cloud.example.com";
const TOKEN = "prefix.secret";

function chunksOf(contents: Buffer, parts = 3): Uint8Array[] {
  const size = Math.ceil(contents.length / parts);
  return Array.from({ length: parts }, (_, index) =>
    contents.subarray(index * size, (index + 1) * size),
  );
}

async function* stream(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function jsonResponse(status: number, body: unknown): UpdateResponse {
  return { status, json: async () => body, body: null };
}

function availableAnswer(overrides: Record<string, unknown> = {}) {
  return {
    status: "available",
    version: "1.4.2",
    size: INSTALLER.length,
    sha512: DIGEST,
    download_url: "https://updates.example.com/register-updates/1.4.2/Setup.exe",
    ...overrides,
  };
}

interface Options {
  isPackaged?: boolean;
  cloudUrl?: string | undefined;
  token?: string | undefined;
  coreStatus?: CoreStatus;
  safeAnswers?: boolean[];
  checkResponse?: () => Promise<UpdateResponse>;
  downloadChunks?: Uint8Array[];
  downloadResponse?: () => UpdateResponse;
  spawnFails?: boolean;
  clearPendingFails?: boolean;
}

function setup(options: Options = {}) {
  const requests: { url: string; headers: Record<string, string> | undefined }[] = [];
  const spawned: { path: string; args: readonly string[] }[] = [];
  const reported: unknown[] = [];
  const statusChanges: CoreStatus[] = [];
  const events: string[] = [];
  const files = new Map<string, Buffer>();
  const removed: string[] = [];
  const waits: { ms: number; resolve: () => void }[] = [];
  let status: CoreStatus = options.coreStatus ?? "up";
  let token = "token" in options ? options.token : TOKEN;
  let asked = 0;
  let quits = 0;
  let holdReleases = 0;
  let cleared = 0;
  const safeAnswers = [...(options.safeAnswers ?? [true])];

  const updater = createRegisterUpdater({
    isPackaged: options.isPackaged ?? true,
    cloudUrl: "cloudUrl" in options ? options.cloudUrl : CLOUD,
    installedVersion: "1.4.1",
    readDeviceToken: () => token,
    fetch: async (url, init) => {
      requests.push({ url, headers: init?.headers });
      if (url.startsWith(`${CLOUD}/api/register/update`)) {
        return options.checkResponse?.() ?? jsonResponse(200, availableAnswer());
      }
      return (
        options.downloadResponse?.() ?? {
          status: 200,
          json: async () => undefined,
          body: stream(options.downloadChunks ?? chunksOf(INSTALLER)),
        }
      );
    },
    files: {
      clearPending: async () => {
        if (options.clearPendingFails) {
          throw new Error("EBUSY: pending-update");
        }
        cleared += 1;
        files.clear();
      },
      pathOf: (name) => `/data/pending-update/${name}`,
      open: async (name) => {
        const written: Buffer[] = [];
        files.set(name, Buffer.alloc(0));
        return {
          write: async (chunk) => {
            written.push(Buffer.from(chunk));
            files.set(name, Buffer.concat(written));
          },
          close: async () => {},
        };
      },
      remove: async (name) => {
        removed.push(name);
        files.delete(name);
      },
    },
    createHash: () => {
      const hash = createHash("sha512");
      return {
        update: (chunk) => {
          hash.update(chunk);
        },
        digestBase64: () => hash.digest("base64"),
      };
    },
    wait: (ms) =>
      new Promise<void>((resolve) => {
        waits.push({ ms, resolve });
      }),
    coreStatus: () => status,
    setCoreStatus: (next) => {
      status = next;
      statusChanges.push(next);
      events.push(`status:${next}`);
    },
    askSafeMoment: async () => {
      asked += 1;
      return safeAnswers.shift() ?? true;
    },
    releaseHold: () => {
      holdReleases += 1;
    },
    spawnInstaller: async (path, args) => {
      if (options.spawnFails) {
        throw new Error("spawn EACCES");
      }
      spawned.push({ path, args });
      events.push("spawn");
    },
    quit: () => {
      quits += 1;
      events.push("quit");
    },
    report: (error) => {
      reported.push(error);
    },
  });

  return {
    updater,
    requests,
    spawned,
    reported,
    statusChanges,
    events,
    files,
    removed,
    waits,
    setStatus: (next: CoreStatus) => {
      status = next;
    },
    setToken: (next: string | undefined) => {
      token = next;
    },
    counts: () => ({ asked, quits, holdReleases, cleared }),
  };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("createRegisterUpdater", () => {
  describe("when it runs", () => {
    it.each([
      ["the app is not packaged", { isPackaged: false }],
      ["the channel has no cloud address", { cloudUrl: undefined }],
    ])("stays off silently when %s", async (_case, options) => {
      const { updater, requests, waits, reported, counts } = setup(options);

      updater.start();
      await updater.runPass();

      expect(requests).toEqual([]);
      expect(waits).toEqual([]);
      expect(reported).toEqual([]);
      expect(counts().cleared).toBe(0);
    });

    it("checks nothing while the device has no credentials", async () => {
      const { updater, requests, waits, reported } = setup({ token: undefined });

      await updater.runPass();
      updater.start();
      await flush();
      waits.shift()?.resolve();
      await flush();

      expect(requests).toEqual([]);
      expect(reported).toEqual([]);
      expect(waits.map((wait) => wait.ms)).toEqual([3_600_000]);
    });

    it("checks at the next check once the register is enrolled while it runs", async () => {
      const { updater, requests, waits, setToken } = setup({
        token: undefined,
        checkResponse: async () => jsonResponse(200, { status: "up_to_date" }),
      });

      updater.start();
      await flush();
      setToken(TOKEN);
      waits.shift()?.resolve();
      await flush();

      expect(requests).toHaveLength(1);
    });

    it("reports a pending folder it can not clear and keeps checking", async () => {
      const { updater, requests, waits, reported } = setup({
        clearPendingFails: true,
        checkResponse: async () => jsonResponse(200, { status: "up_to_date" }),
      });

      updater.start();
      await flush();
      expect(reported).toEqual([new Error("EBUSY: pending-update")]);
      waits.shift()?.resolve();
      await flush();

      expect(requests).toHaveLength(1);
    });

    it("clears what a previous download left behind when it starts", async () => {
      const { updater, counts } = setup();

      updater.start();
      await flush();

      expect(counts().cleared).toBe(1);
    });

    it("checks 60 seconds after starting and then every hour", async () => {
      const { updater, requests, waits } = setup({
        checkResponse: async () => jsonResponse(200, { status: "up_to_date" }),
      });

      updater.start();
      await flush();
      expect(waits.map((wait) => wait.ms)).toEqual([60_000]);
      expect(requests).toEqual([]);

      waits.shift()?.resolve();
      await flush();
      expect(requests).toHaveLength(1);
      expect(waits.map((wait) => wait.ms)).toEqual([3_600_000]);

      waits.shift()?.resolve();
      await flush();
      expect(requests).toHaveLength(2);
    });
  });

  describe("checking the cloud", () => {
    it("asks with the installed version and the device token", async () => {
      const { updater, requests } = setup({
        checkResponse: async () => jsonResponse(200, { status: "up_to_date" }),
      });

      await updater.runPass();

      expect(requests).toEqual([
        {
          url: `${CLOUD}/api/register/update?installed_version=1.4.1`,
          headers: { Authorization: `Bearer ${TOKEN}` },
        },
      ]);
    });

    it("does nothing more when the register is up to date", async () => {
      const { updater, requests, spawned, reported } = setup({
        checkResponse: async () => jsonResponse(200, { status: "up_to_date" }),
      });

      await updater.runPass();

      expect(requests).toHaveLength(1);
      expect(spawned).toEqual([]);
      expect(reported).toEqual([]);
    });

    it.each([
      ["a refusal", async () => jsonResponse(503, {})],
      [
        "a network error",
        async (): Promise<UpdateResponse> => {
          throw new Error("net::ERR_INTERNET_DISCONNECTED");
        },
      ],
      ["an unreadable body", async () => jsonResponse(200, { status: "later" })],
      [
        "a body that is not JSON",
        async (): Promise<UpdateResponse> => ({
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token <");
          },
          body: null,
        }),
      ],
    ])("reports %s and downloads nothing", async (_case, checkResponse) => {
      const { updater, requests, reported, spawned } = setup({ checkResponse });

      await updater.runPass();

      expect(reported).toHaveLength(1);
      expect(requests).toHaveLength(1);
      expect(spawned).toEqual([]);
    });

    it("keeps checking after a failed check", async () => {
      const { updater, waits } = setup({ checkResponse: async () => jsonResponse(500, {}) });

      updater.start();
      await flush();
      waits.shift()?.resolve();
      await flush();

      expect(waits.map((wait) => wait.ms)).toEqual([3_600_000]);
    });
  });

  describe("downloading", () => {
    it("downloads without credentials into the pending folder and installs it", async () => {
      const { updater, requests, files } = setup();

      await updater.runPass();

      expect(requests[1]).toEqual({
        url: "https://updates.example.com/register-updates/1.4.2/Setup.exe",
        headers: undefined,
      });
      expect(files.get("update-1.4.2.exe")).toEqual(INSTALLER);
    });

    it.each([
      ["fewer bytes than declared", chunksOf(INSTALLER).slice(0, 2)],
      ["more bytes than declared", [...chunksOf(INSTALLER), Buffer.from("extra")]],
      ["the right size with other contents", [Buffer.alloc(INSTALLER.length, 1)]],
    ])("deletes a download with %s and reports it", async (_case, downloadChunks) => {
      const { updater, spawned, removed, reported, counts } = setup({ downloadChunks });

      await updater.runPass();

      expect(spawned).toEqual([]);
      expect(removed).toEqual(["update-1.4.2.exe"]);
      expect(reported).toHaveLength(1);
      expect(counts().asked).toBe(0);
    });

    it("stops reading once the bytes exceed the declared size", async () => {
      let pulled = 0;
      async function* endless(): AsyncIterable<Uint8Array> {
        while (true) {
          pulled += 1;
          yield Buffer.alloc(INSTALLER.length);
        }
      }
      const { updater, removed, reported } = setup({
        downloadResponse: () => ({ status: 200, json: async () => undefined, body: endless() }),
      });

      await updater.runPass();

      expect(pulled).toBeLessThan(5);
      expect(removed).toEqual(["update-1.4.2.exe"]);
      expect(reported).toHaveLength(1);
    });

    it.each([
      ["a refusal", { status: 404, json: async () => undefined, body: null }],
      ["an answer without content", { status: 200, json: async () => undefined, body: null }],
    ])("reports %s from the download address", async (_case, response) => {
      const { updater, spawned, reported } = setup({ downloadResponse: () => response });

      await updater.runPass();

      expect(spawned).toEqual([]);
      expect(reported).toHaveLength(1);
    });

    it("deletes the file and reports a download that breaks half way", async () => {
      async function* breaking(): AsyncIterable<Uint8Array> {
        yield INSTALLER.subarray(0, 10);
        throw new Error("net::ERR_CONNECTION_RESET");
      }
      const { updater, spawned, removed, reported } = setup({
        downloadResponse: () => ({ status: 200, json: async () => undefined, body: breaking() }),
      });

      await updater.runPass();

      expect(spawned).toEqual([]);
      expect(removed).toEqual(["update-1.4.2.exe"]);
      expect(reported).toHaveLength(1);
    });
  });

  describe("choosing the moment", () => {
    it("installs a verified download: status, spawn with the exact arguments, then quits", async () => {
      const { updater, spawned, events, counts } = setup();

      await updater.runPass();

      expect(spawned).toEqual([
        {
          path: "/data/pending-update/update-1.4.2.exe",
          args: ["--updated", "/S", "--force-run"],
        },
      ]);
      expect(events).toEqual(["status:updating", "spawn", "quit"]);
      expect(counts().asked).toBe(1);
    });

    it("waits while the core is starting without asking it", async () => {
      const { updater, waits, spawned, counts, setStatus } = setup({ coreStatus: "starting" });

      const pass = updater.runPass();
      await flush();
      expect(counts().asked).toBe(0);
      expect(waits.map((wait) => wait.ms)).toEqual([60_000]);

      setStatus("up");
      waits.shift()?.resolve();
      await pass;

      expect(counts().asked).toBe(1);
      expect(spawned).toHaveLength(1);
    });

    it("asks again every 60 seconds while a sale is open, then installs", async () => {
      const { updater, waits, spawned, counts, statusChanges } = setup({
        safeAnswers: [false, false, true],
      });

      const pass = updater.runPass();
      await flush();
      expect(spawned).toEqual([]);
      expect(waits.map((wait) => wait.ms)).toEqual([60_000]);

      waits.shift()?.resolve();
      await flush();
      expect(spawned).toEqual([]);
      expect(waits.map((wait) => wait.ms)).toEqual([60_000]);

      waits.shift()?.resolve();
      await pass;

      expect(counts().asked).toBe(3);
      expect(spawned).toHaveLength(1);
      expect(statusChanges).toEqual(["updating"]);
    });

    it.each([
      ["down", "down"],
      ["a status added later", "refused"],
    ])("installs without asking when the core is %s", async (_case, coreStatus) => {
      const { updater, spawned, counts } = setup({ coreStatus: coreStatus as CoreStatus });

      await updater.runPass();

      expect(counts().asked).toBe(0);
      expect(spawned).toHaveLength(1);
    });
  });

  describe("when the installer can not be launched", () => {
    it("reports it, releases the hold, restores the status, removes the file and keeps running", async () => {
      const { updater, reported, counts, statusChanges, events, removed, spawned } = setup({
        spawnFails: true,
      });

      await updater.runPass();

      expect(reported).toHaveLength(1);
      expect(counts().holdReleases).toBe(1);
      expect(statusChanges).toEqual(["updating", "up"]);
      expect(removed).toEqual(["update-1.4.2.exe"]);
      expect(spawned).toEqual([]);
      expect(events).not.toContain("quit");
    });

    it("checks again at the next check", async () => {
      const { updater, waits } = setup({ spawnFails: true });

      updater.start();
      await flush();
      waits.shift()?.resolve();
      await flush();

      expect(waits.map((wait) => wait.ms)).toEqual([3_600_000]);
    });
  });

  describe("passes", () => {
    it("never runs two passes at once", async () => {
      const { updater, requests, waits } = setup({ safeAnswers: [false, true] });

      const first = updater.runPass();
      await flush();
      const second = updater.runPass();
      await flush();
      waits.shift()?.resolve();
      await Promise.all([first, second]);

      expect(
        requests.filter((request) => request.url.includes("/api/register/update")),
      ).toHaveLength(1);
    });

    it("makes no further checks once an installer was launched", async () => {
      const { updater, requests, waits } = setup();

      updater.start();
      await flush();
      waits.shift()?.resolve();
      await flush();
      const checks = requests.length;

      expect(waits).toEqual([]);
      await updater.runPass();

      expect(requests).toHaveLength(checks);
    });
  });
});
