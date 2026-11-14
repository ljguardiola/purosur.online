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
import { isAbsolute, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pendingUpdateFiles,
  sha512Hash,
  spawnDetachedInstaller,
  startInstallerThroughPowerShell,
  updateFetch,
} from "./register-update-adapters";

const lockedFiles = vi.hoisted(() => new Set<string>());

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const holdsLockedFile = (path: string) =>
    [...lockedFiles].some((locked) => {
      const fromPath = relative(path, locked);
      return !fromPath.startsWith("..") && !isAbsolute(fromPath);
    });
  return {
    ...actual,
    rmSync: (...args: Parameters<typeof actual.rmSync>) => {
      if (holdsLockedFile(String(args[0]))) {
        throw Object.assign(new Error(`EPERM: operation not permitted, rm '${args[0]}'`), {
          code: "EPERM",
        });
      }
      actual.rmSync(...args);
    },
  };
});

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

  describe("when an entry of the folder can not be removed", () => {
    beforeEach(() => {
      mkdirSync(folder);
      writeFileSync(join(folder, "a-old-installer.exe"), "old");
      mkdirSync(join(folder, "held"));
      writeFileSync(join(folder, "held", "in-use.exe"), "in use");
      writeFileSync(join(folder, "z-old-installer.exe"), "old");
      lockedFiles.add(join(folder, "held", "in-use.exe"));
    });

    afterEach(() => {
      lockedFiles.clear();
    });

    it("removes every other entry and rejects with the failure", async () => {
      await expect(pendingUpdateFiles(folder).clearPending()).rejects.toMatchObject({
        code: "EPERM",
      });

      expect(readdirSync(folder)).toEqual(["held"]);
    });
  });

  it("overwrites a file left behind under the same name", async () => {
    mkdirSync(folder);
    writeFileSync(join(folder, "installer.exe"), "older and longer bytes");

    const file = await pendingUpdateFiles(folder).open("installer.exe");
    await file.write(encoder.encode("new"));
    await file.close();

    expect(readFileSync(join(folder, "installer.exe"), "utf8")).toBe("new");
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

describe("startInstallerThroughPowerShell", () => {
  function launcherAnswering(answer: () => Promise<{ stdout: string; stderr: string }>) {
    const run = vi.fn(async (_file: string, _args: readonly string[], _options: object) =>
      answer(),
    );
    return { run, launch: startInstallerThroughPowerShell(run) };
  }

  it("asks PowerShell, without a profile or prompt, in a hidden window and with a timeout", async () => {
    const { run, launch } = launcherAnswering(async () => ({ stdout: "", stderr: "" }));

    await launch("C:\\pending-update\\update-1.4.2.exe", ["--updated", "/S"]);

    expect(run).toHaveBeenCalledWith(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", expect.any(String)],
      { timeout: 30_000, windowsHide: true },
    );
  });

  it("starts the installer and, when Windows refuses, writes Windows' own message to stderr as UTF-8 and exits 1", async () => {
    const { run, launch } = launcherAnswering(async () => ({ stdout: "", stderr: "" }));

    await launch("C:\\pending-update\\update-1.4.2.exe", ["--updated", "/S"]);

    expect(run.mock.calls[0]?.[1]?.[3]).toBe(
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $ErrorActionPreference = 'Stop'; try { Start-Process -FilePath 'C:\\pending-update\\update-1.4.2.exe' -ArgumentList '--updated','/S' } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }",
    );
  });

  it.each([
    ["an apostrophe", "'"],
    ["a left single quotation mark", "\u2018"],
    ["a right single quotation mark", "\u2019"],
    ["a single low-9 quotation mark", "\u201A"],
    ["a single high-reversed-9 quotation mark", "\u201B"],
  ])(
    "starts the installer with its arguments, each quoted so %s stays part of it",
    async (_name, quote) => {
      const { run, launch } = launcherAnswering(async () => ({ stdout: "", stderr: "" }));

      await launch(`C:\\Users\\O${quote}Neil\\pending-update\\update-1.4.2.exe`, [
        "--updated",
        "/S",
      ]);

      const script = String(run.mock.calls[0]?.[1]?.[3]);
      expect(script).toContain(
        `Start-Process -FilePath 'C:\\Users\\O${quote}${quote}Neil\\pending-update\\update-1.4.2.exe' -ArgumentList '--updated','/S'`,
      );
    },
  );

  it("rejects with Windows' own message when PowerShell can not start the installer", async () => {
    const refusal = Object.assign(new Error("Command failed: powershell.exe"), {
      stderr:
        "Operation did not complete successfully because the file contains a virus or potentially unwanted software.\r\n",
    });
    const { launch } = launcherAnswering(async () => {
      throw refusal;
    });

    const launched = launch("C:\\pending-update\\update-1.4.2.exe", ["--updated", "/S"]);

    await expect(launched).rejects.toThrow(
      new Error(
        "Windows refused to start the installer: Operation did not complete successfully because the file contains a virus or potentially unwanted software.",
      ),
    );
    await expect(launched).rejects.toHaveProperty("cause", refusal);
  });
});
