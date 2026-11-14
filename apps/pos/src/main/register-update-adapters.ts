import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readdirSync, rmSync } from "node:fs";
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
      mkdirSync(folder, { recursive: true });
      const failures: unknown[] = [];
      for (const entry of readdirSync(folder)) {
        try {
          rmSync(join(folder, entry), { recursive: true, force: true });
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0) {
        throw failures[0];
      }
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

const POWERSHELL_TIMEOUT_MS = 30_000;

type RunProcess = (
  file: string,
  args: readonly string[],
  options: { timeout: number; windowsHide: boolean },
) => Promise<{ stdout: string; stderr: string }>;

function powerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function stderrOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "stderr" in error) {
    return String(error.stderr).trim();
  }
  return "";
}

export function startInstallerThroughPowerShell(
  run: RunProcess,
): (path: string, args: readonly string[]) => Promise<void> {
  return async (path, args) => {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `try { Start-Process -FilePath ${powerShellLiteral(path)} -ArgumentList ${args.map(powerShellLiteral).join(",")} } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`,
    ].join("; ");
    try {
      await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        timeout: POWERSHELL_TIMEOUT_MS,
        windowsHide: true,
      });
    } catch (error) {
      const message = stderrOf(error) || (error instanceof Error ? error.message : String(error));
      throw new Error(`Windows refused to start the installer: ${message}`, { cause: error });
    }
  };
}
