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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

    expect(response.body).not.toBeNull();
    expect(await collect(response.body ?? [])).toEqual(chunks);
  });

  it("releases the body's reader once it is read through", async () => {
    const stream = streamOf([encoder.encode("one")]);
    const response = await updateFetch(async () => new Response(stream))("u");

    await collect(response.body ?? []);

    expect(stream.locked).toBe(false);
  });

  it("releases the body's reader when the reader stops early", async () => {
    const stream = streamOf([encoder.encode("one"), encoder.encode("two")]);
    const response = await updateFetch(async () => new Response(stream))("u");

    for await (const _chunk of response.body ?? []) {
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
});
