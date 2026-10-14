import { describe, expect, it } from "vitest";
import {
  OFFSITE_DUMP_MAX_OBJECT_BYTES,
  type OffsiteDumpDeps,
  offsiteDumpCommand,
  resolveOffsiteDumpConfig,
} from "./offsite-dump.js";

const ENV = {
  OFFSITE_DUMP_DATABASE_URL: "postgresql://offsite_dump:s3cret-db@db.internal:5432/app",
  OFFSITE_DUMP_AGE_RECIPIENT: "age1fictionalrecipient",
  OFFSITE_DUMP_BUCKET_ENDPOINT: "https://s3.us-west-004.example-storage.test",
  OFFSITE_DUMP_BUCKET_NAME: "dump-vault",
  OFFSITE_DUMP_BUCKET_REGION: "us-west-004",
  OFFSITE_DUMP_BUCKET_ACCESS_KEY_ID: "fictional-key-id",
  OFFSITE_DUMP_BUCKET_SECRET_ACCESS_KEY: "fictional-secret-key",
};

const SHA256 = "ab".repeat(32);
const ENCRYPTED_DUMP = "encrypted-dump-bytes";

interface Recorded {
  method: string;
  url: string;
  headers: Headers;
  body: string;
}

interface Harness {
  deps: OffsiteDumpDeps;
  requests: Recorded[];
  logs: string[];
  dumpCalls: { databaseUrl: string; ageRecipient: string; outputPath: string }[];
  cleanups: number;
}

function harness(
  options: {
    now?: Date;
    answers?: number[];
    dumpResult?: { sizeBytes: number; sha256: string } | Error;
  } = {},
): Harness {
  const requests: Recorded[] = [];
  const logs: string[] = [];
  const dumpCalls: Harness["dumpCalls"] = [];
  const state = { cleanups: 0 };
  const answers = [...(options.answers ?? [])];
  const result = options.dumpResult ?? {
    sizeBytes: ENCRYPTED_DUMP.length,
    sha256: SHA256,
  };
  const deps: OffsiteDumpDeps = {
    now: () => options.now ?? new Date("2026-10-14T06:00:03.000Z"),
    fetch: async (request) => {
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: await request.text(),
      });
      return new Response(null, { status: answers.shift() ?? 200 });
    },
    workspace: async () => ({
      dumpPath: "/work/dump.age",
      cleanup: async () => {
        state.cleanups += 1;
      },
    }),
    dumpToFile: async (request) => {
      dumpCalls.push(request);
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
    readDump: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(ENCRYPTED_DUMP));
          controller.close();
        },
      }),
    log: (line) => logs.push(line),
  };
  return {
    deps,
    requests,
    logs,
    dumpCalls,
    get cleanups() {
      return state.cleanups;
    },
  };
}

describe("resolveOffsiteDumpConfig", () => {
  it("reads the database, the recipient and the bucket from the environment", () => {
    expect(resolveOffsiteDumpConfig(ENV)).toEqual({
      databaseUrl: ENV.OFFSITE_DUMP_DATABASE_URL,
      ageRecipient: ENV.OFFSITE_DUMP_AGE_RECIPIENT,
      bucket: {
        endpoint: ENV.OFFSITE_DUMP_BUCKET_ENDPOINT,
        name: ENV.OFFSITE_DUMP_BUCKET_NAME,
        region: ENV.OFFSITE_DUMP_BUCKET_REGION,
        accessKeyId: ENV.OFFSITE_DUMP_BUCKET_ACCESS_KEY_ID,
        secretAccessKey: ENV.OFFSITE_DUMP_BUCKET_SECRET_ACCESS_KEY,
      },
    });
  });

  it.each(Object.keys(ENV))("names %s when it is missing", (name) => {
    expect(() => resolveOffsiteDumpConfig({ ...ENV, [name]: undefined })).toThrow(
      `${name} is not set`,
    );
  });

  it("treats an empty value as missing", () => {
    expect(() => resolveOffsiteDumpConfig({ ...ENV, OFFSITE_DUMP_BUCKET_NAME: "" })).toThrow(
      "OFFSITE_DUMP_BUCKET_NAME is not set",
    );
  });

  it("names every missing variable at once", () => {
    expect(() => resolveOffsiteDumpConfig({})).toThrow(
      /OFFSITE_DUMP_DATABASE_URL.*OFFSITE_DUMP_AGE_RECIPIENT.*OFFSITE_DUMP_BUCKET_ENDPOINT/,
    );
  });
});

describe("offsiteDumpCommand", () => {
  it("dumps the database encrypted to the recipient into the workspace", async () => {
    const run = harness();

    await offsiteDumpCommand(ENV, run.deps);

    expect(run.dumpCalls).toEqual([
      {
        databaseUrl: ENV.OFFSITE_DUMP_DATABASE_URL,
        ageRecipient: ENV.OFFSITE_DUMP_AGE_RECIPIENT,
        outputPath: "/work/dump.age",
      },
    ]);
  });

  it("uploads the encrypted dump, then its manifest, under the night's UTC date", async () => {
    const run = harness();

    const exitCode = await offsiteDumpCommand(ENV, run.deps);

    expect(exitCode).toBe(0);
    expect(run.requests.map((request) => [request.method, request.url])).toEqual([
      [
        "PUT",
        "https://dump-vault.s3.us-west-004.example-storage.test/offsite-dumps/2026-10-14.dump.age",
      ],
      [
        "PUT",
        "https://dump-vault.s3.us-west-004.example-storage.test/offsite-dumps/2026-10-14.manifest.json",
      ],
    ]);
    expect(run.requests[0]?.body).toBe(ENCRYPTED_DUMP);
    expect(JSON.parse(run.requests[1]?.body ?? "")).toEqual({
      night: "2026-10-14",
      sizeBytes: ENCRYPTED_DUMP.length,
      sha256: SHA256,
    });
  });

  it("takes the night from the clock in UTC, not from the local calendar", async () => {
    const run = harness({ now: new Date("2026-10-14T23:59:59.000Z") });

    await offsiteDumpCommand(ENV, run.deps);

    expect(run.requests[0]?.url).toContain("/offsite-dumps/2026-10-14.dump.age");
  });

  it("signs each upload with the create-only credential for the bucket's region", async () => {
    const run = harness();

    await offsiteDumpCommand(ENV, run.deps);

    for (const request of run.requests) {
      expect(request.headers.get("authorization")).toContain(
        "Credential=fictional-key-id/20261014/us-west-004/s3/aws4_request",
      );
    }
  });

  it("states the dump's size and SHA-256 so the storage can verify the bytes it receives", async () => {
    const run = harness();

    await offsiteDumpCommand(ENV, run.deps);

    expect(run.requests[0]?.headers.get("x-amz-content-sha256")).toBe(SHA256);
    expect(run.requests[0]?.headers.get("content-length")).toBe(String(ENCRYPTED_DUMP.length));
  });

  it("removes the workspace after a success", async () => {
    const run = harness();

    await offsiteDumpCommand(ENV, run.deps);

    expect(run.cleanups).toBe(1);
  });

  it("logs the night and the size it shipped", async () => {
    const run = harness();

    await offsiteDumpCommand(ENV, run.deps);

    expect(run.logs.join("\n")).toContain(
      `offsite-dump: shipped the dump of 2026-10-14 (${ENCRYPTED_DUMP.length} bytes)`,
    );
  });

  describe("when the dump cannot be made", () => {
    it("exits non-zero, uploads nothing and says why", async () => {
      const run = harness({ dumpResult: new Error("pg_dump exited with code 1") });

      const exitCode = await offsiteDumpCommand(ENV, run.deps);

      expect(exitCode).toBe(1);
      expect(run.requests).toEqual([]);
      expect(run.logs.join("\n")).toContain("offsite-dump: failed: pg_dump exited with code 1");
      expect(run.cleanups).toBe(1);
    });
  });

  describe("when the dump object is refused", () => {
    it("exits non-zero and never uploads the manifest", async () => {
      const run = harness({ answers: [403] });

      const exitCode = await offsiteDumpCommand(ENV, run.deps);

      expect(exitCode).toBe(1);
      expect(run.requests).toHaveLength(1);
      expect(run.logs.join("\n")).toContain(
        "offsite-dump: failed: uploading offsite-dumps/2026-10-14.dump.age answered HTTP 403",
      );
      expect(run.cleanups).toBe(1);
    });
  });

  describe("when the manifest is refused", () => {
    it("exits non-zero", async () => {
      const run = harness({ answers: [200, 500] });

      const exitCode = await offsiteDumpCommand(ENV, run.deps);

      expect(exitCode).toBe(1);
      expect(run.logs.join("\n")).toContain(
        "uploading offsite-dumps/2026-10-14.manifest.json answered HTTP 500",
      );
    });
  });

  describe("when the dump is larger than one upload can carry", () => {
    it("refuses it explicitly and uploads nothing", async () => {
      const run = harness({
        dumpResult: { sizeBytes: OFFSITE_DUMP_MAX_OBJECT_BYTES + 1, sha256: SHA256 },
      });

      const exitCode = await offsiteDumpCommand(ENV, run.deps);

      expect(exitCode).toBe(1);
      expect(run.requests).toEqual([]);
      expect(run.logs.join("\n")).toContain("larger than the 5000000000 bytes one upload carries");
    });

    it("accepts a dump of exactly the limit", async () => {
      const run = harness({
        dumpResult: { sizeBytes: OFFSITE_DUMP_MAX_OBJECT_BYTES, sha256: SHA256 },
      });

      expect(await offsiteDumpCommand(ENV, run.deps)).toBe(0);
    });
  });

  describe("when the configuration is incomplete", () => {
    it("exits non-zero naming the variable and does nothing else", async () => {
      const run = harness();

      const exitCode = await offsiteDumpCommand(
        { ...ENV, OFFSITE_DUMP_AGE_RECIPIENT: undefined },
        run.deps,
      );

      expect(exitCode).toBe(1);
      expect(run.logs.join("\n")).toContain("offsite-dump: OFFSITE_DUMP_AGE_RECIPIENT is not set");
      expect(run.dumpCalls).toEqual([]);
    });
  });

  it("never logs the database URL or the storage secret", async () => {
    const run = harness({ dumpResult: new Error("pg_dump exited with code 1"), answers: [403] });

    await offsiteDumpCommand(ENV, run.deps);

    const logged = run.logs.join("\n");
    expect(logged).not.toContain("s3cret-db");
    expect(logged).not.toContain("fictional-secret-key");
  });
});
