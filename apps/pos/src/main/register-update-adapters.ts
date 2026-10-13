import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { RegisterUpdaterDependencies, UpdateFiles } from "./register-update";

type NetFetch = (url: string, init?: { headers: Record<string, string> }) => Promise<Response>;

async function* chunksOf(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export function updateFetch(netFetch: NetFetch): RegisterUpdaterDependencies["fetch"] {
  return async (url, init) => {
    const response = await netFetch(url, init);
    return {
      status: response.status,
      json: () => response.json(),
      body: response.body === null ? null : chunksOf(response.body),
    };
  };
}

export function pendingUpdateFiles(folder: string): UpdateFiles {
  return {
    clearPending: async () => {
      rmSync(folder, { recursive: true, force: true });
      mkdirSync(folder, { recursive: true });
    },
    pathOf: (name) => join(folder, name),
    open: async (name) => {
      const stream = createWriteStream(join(folder, name));
      let failure: Error | undefined;
      stream.on("error", (error) => {
        failure ??= error;
      });
      const settle =
        (resolve: () => void, reject: (error: Error) => void) => (error?: Error | null) => {
          const cause = failure ?? error;
          if (cause) {
            reject(cause);
          } else {
            resolve();
          }
        };
      return {
        write: (chunk) =>
          new Promise<void>((resolve, reject) => {
            stream.write(chunk, settle(resolve, reject));
          }),
        close: () =>
          new Promise<void>((resolve, reject) => {
            stream.end(settle(resolve, reject));
          }),
      };
    },
    remove: async (name) => rmSync(join(folder, name), { force: true }),
  };
}

export function sha512Hash(): ReturnType<RegisterUpdaterDependencies["createHash"]> {
  const hash = createHash("sha512");
  return {
    update: (chunk) => {
      hash.update(chunk);
    },
    digestBase64: () => hash.digest("base64"),
  };
}

export function spawnDetachedInstaller(path: string, args: readonly string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const installer = spawn(path, [...args], { detached: true, stdio: "ignore" });
    installer.once("error", reject);
    installer.once("spawn", () => {
      installer.unref();
      resolve();
    });
  });
}
