import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";
import { generateArcaTestCredentials } from "./fiscal/test-support/arca-test-credentials.js";
import { VALID_ARCA_CERTIFICATE } from "./test-support/arca-certificate-fixtures.js";

function envWithout(...names: string[]): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of names) {
    delete env[name];
  }
  return env;
}

async function startRefusingProxy() {
  const requestedHosts: string[] = [];
  const server = createServer((request, response) => {
    requestedHosts.push(new URL(request.url ?? "", "http://unknown").host);
    response.writeHead(502).end();
  });
  server.on("connect", (request: IncomingMessage, socket) => {
    requestedHosts.push(request.url ?? "");
    socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requestedHosts,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function runEntry(entrypoint: string, env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [entrypoint], { env });
  let stdout = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  const [status] = (await once(child, "close")) as [number | null];
  return { status, stdout };
}

// The command's process ends on its own once it refuses what it was given or reports its calls,
// so each test waits for it to exit however long the machine takes to load the command.
describe("the check-arca-test-environment command", { timeout: 0 }, () => {
  const ENTRYPOINT = join(inject("cloudBuildDir"), "check-arca-test-environment.js");

  it("fails with a clear message when the certificate is not set", () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
      env: envWithout("ARCA_CERTIFICATE", "ARCA_PRIVATE_KEY"),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("check-arca-test-environment: ARCA_CERTIFICATE is not set");
  });

  it("refuses any argument, without calling the tax authority", () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT, "--environment", "production"], {
      env: { ...process.env, ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE, ARCA_PRIVATE_KEY: "KEY" },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("check-arca-test-environment: accepts no argument");
  });

  it("reports each call and exits with failure when the tax authority cannot be reached", async () => {
    const credentials = generateArcaTestCredentials();
    const proxy = await startRefusingProxy();
    try {
      const result = await runEntry(ENTRYPOINT, {
        ...envWithout("NO_PROXY", "no_proxy"),
        HTTPS_PROXY: proxy.url,
        https_proxy: proxy.url,
        ARCA_CERTIFICATE: credentials.certificatePem,
        ARCA_PRIVATE_KEY: credentials.privateKeyPem,
      });

      expect(proxy.requestedHosts.map((host) => host.replace(/:443$/, "")).sort()).toEqual([
        "wsaahomo.afip.gov.ar",
        "wswhomo.afip.gov.ar",
      ]);
      expect(result.stdout).toContain("FEDummy: no answer the client could read");
      expect(result.stdout).toContain("loginCms: failed");
      expect(result.status).toBe(1);
    } finally {
      await proxy.close();
    }
  });
});
