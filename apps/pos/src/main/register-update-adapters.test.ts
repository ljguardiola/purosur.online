import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pendingUpdateFiles,
  sha512Hash,
  spawnDetachedInstaller,
  updateFetch,
} from "./register-update-adapters";

const encoder = new TextEncoder();

function streamOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function collect(body: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }
  return chunks;
}

function bodyOf(response: { body: AsyncIterable<Uint8Array> | null }): AsyncIterable<Uint8Array> {
  if (response.body === null) {
    throw new Error("the response has no body");
  }
  return response.body;
}

describe("updateFetch", () => {
  it("passes the status and the parsed body through", async () => {
    const fetchUpdate = updateFetch(async () => Response.json({ status: "up_to_date" }));

    const response = await fetchUpdate("https://cloud.example.test/update");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "up_to_date" });
  });

  it("forwards the url and the headers it was asked with", async () => {
    const calls: unknown[][] = [];
    const fetchUpdate = updateFetch(async (...args) => {
      calls.push(args);
      return new Response(null, { status: 204 });
    });

    await fetchUpdate("https://cloud.example.test/update", { headers: { Authorization: "x" } });

    expect(calls).toEqual([
      ["https://cloud.example.test/update", { headers: { Authorization: "x" } }],
    ]);
  });

  it("has no body when the response has none", async () => {
    const response = await updateFetch(async () => new Response(null, { status: 204 }))("u");

    expect(response.body).toBeNull();
  });

  it("yields every chunk of the body in order", async () => {
    const chunks = [encoder.encode("one"), encoder.encode("two"), encoder.encode("three")];
    const response = await updateFetch(async () => new Response(streamOf(chunks)))("u");

    expect(await collect(bodyOf(response))).toEqual(chunks);
  });

  it("releases the body's reader once it is read through", async () => {
    const stream = streamOf([encoder.encode("one")]);
    const response = await updateFetch(async () => new Response(stream))("u");

    await collect(bodyOf(response));

    expect(stream.locked).toBe(false);
  });

  it("releases the body's reader when the reader stops early", async () => {
    const stream = streamOf([encoder.encode("one"), encoder.encode("two")]);
    const response = await updateFetch(async () => new Response(stream))("u");

    for await (const _chunk of bodyOf(response)) {
      break;
    }

    expect(stream.locked).toBe(false);
  });
});

describe("pendingUpdateFiles", () => {
  let root: string;
  let folder: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "register-update-adapters-"));
    folder = join(root, "pending-update");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates the folder when clearing one that does not exist", async () => {
    await pendingUpdateFiles(folder).clearPending();

    expect(readdirSync(folder)).toEqual([]);
  });

  it("empties the folder when clearing one that holds files", async () => {
    mkdirSync(folder);
    writeFileSync(join(folder, "old-installer.exe"), "old");

    await pendingUpdateFiles(folder).clearPending();

    expect(readdirSync(folder)).toEqual([]);
  });

  it("writes the bytes it is given into a named file", async () => {
    const files = pendingUpdateFiles(folder);
    await files.clearPending();

    const file = await files.open("installer.exe");
    await file.write(encoder.encode("first "));
    await file.write(encoder.encode("second"));
    await file.close();

    expect(readFileSync(join(folder, "installer.exe"), "utf8")).toBe("first second");
  });

  describe("when the file cannot be created", () => {
    let uncaught: unknown[];
    const recordUncaught = (error: unknown) => {
      uncaught.push(error);
    };

    beforeEach(() => {
      uncaught = [];
      process.on("uncaughtException", recordUncaught);
    });

    afterEach(() => {
      process.off("uncaughtException", recordUncaught);
    });

    it("raises no uncaught exception when a write fails", async () => {
      const file = await pendingUpdateFiles(join(folder, "missing")).open("installer.exe");

      await Promise.allSettled([file.write(encoder.encode("bytes"))]);
      await Promise.allSettled([file.close()]);

      expect(uncaught).toEqual([]);
    });

    it("rejects the write with the failure, and the close after it", async () => {
      const file = await pendingUpdateFiles(join(folder, "missing")).open("installer.exe");

      await expect(file.write(encoder.encode("bytes"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(file.close()).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("rejects the close with the failure when nothing was written", async () => {
      const file = await pendingUpdateFiles(join(folder, "missing")).open("installer.exe");

      await expect(file.close()).rejects.toMatchObject({ code: "ENOENT" });

      expect(uncaught).toEqual([]);
    });
  });

  it("removes a named file and tolerates one that is already gone", async () => {
    const files = pendingUpdateFiles(folder);
    await files.clearPending();
    writeFileSync(join(folder, "installer.exe"), "bytes");

    await files.remove("installer.exe");
    await files.remove("installer.exe");

    expect(existsSync(join(folder, "installer.exe"))).toBe(false);
  });

  it("names files inside its folder", () => {
    const path = pendingUpdateFiles(folder).pathOf("installer.exe");

    expect(relative(folder, path)).toBe("installer.exe");
  });
});

describe("sha512Hash", () => {
  it("answers the base64 sha512 of everything it was fed", () => {
    const hash = sha512Hash();

    hash.update(encoder.encode("first "));
    hash.update(encoder.encode("second"));

    expect(hash.digestBase64()).toBe(createHash("sha512").update("first second").digest("base64"));
  });
});

describe("spawnDetachedInstaller", () => {
  it("rejects when the executable does not exist", async () => {
    const missing = join(tmpdir(), "register-update-adapters-no-such-installer.exe");

    await expect(spawnDetachedInstaller(missing, ["/S"])).rejects.toThrow();
  });

  it("settles once the installer runs, handing it its arguments", { timeout: 30_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "register-update-adapters-"));
    const received = join(root, "arguments.json");
    try {
      await spawnDetachedInstaller(process.execPath, [
        "-e",
        "require('node:fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))",
        received,
        "--updated",
        "/S",
      ]);

      await vi.waitFor(
        () => expect(JSON.parse(readFileSync(received, "utf8"))).toEqual(["--updated", "/S"]),
        { timeout: 20_000 },
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
