import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const RESPONSES_DIR = new URL("./wsfe-responses/", import.meta.url);

export const UNREACHABLE_WSFE_ENDPOINT = "http://127.0.0.1:1/wsfev1/service.asmx";

export type FakeWsfeBehavior =
  | { kind: "answers"; status: number; responseFile: string }
  | { kind: "never-answers" };

export interface FakeWsfeServer {
  endpoint: string;
  requests: string[];
  behave(behavior: FakeWsfeBehavior): void;
  close(): Promise<void>;
}

export function answers(responseFile: string, status = 200): FakeWsfeBehavior {
  return { kind: "answers", status, responseFile };
}

export async function startFakeWsfeServer(
  initial: FakeWsfeBehavior = answers("fe-dummy-all-ok.xml"),
): Promise<FakeWsfeServer> {
  let behavior = initial;
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push(Buffer.concat(chunks).toString("utf8"));
      if (behavior.kind === "never-answers") {
        return;
      }
      const body = readFileSync(new URL(behavior.responseFile, RESPONSES_DIR));
      response.writeHead(behavior.status, { "content-type": "text/xml; charset=utf-8" });
      response.end(body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}/wsfev1/service.asmx`,
    requests,
    behave(next) {
      behavior = next;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
