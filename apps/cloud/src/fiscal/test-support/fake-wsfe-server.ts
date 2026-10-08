import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const RESPONSES_DIR = new URL("./wsfe-responses/", import.meta.url);

export const UNREACHABLE_WSFE_ENDPOINT = "http://127.0.0.1:1/wsfev1/service.asmx";

interface FakeWsfeAnswer {
  status: number;
  responseFile: string;
}

export type FakeWsfeBehavior =
  | ({ kind: "answers" } & FakeWsfeAnswer)
  | { kind: "answers-in-turn"; steps: (FakeWsfeAnswer | undefined)[] }
  | ({ kind: "answers-when-released" } & FakeWsfeAnswer)
  | { kind: "never-answers" };

export interface FakeWsfeServer {
  endpoint: string;
  requests: string[];
  behave(behavior: FakeWsfeBehavior): void;
  nextRequest(): Promise<void>;
  release(): void;
  close(): Promise<void>;
}

export function answers(responseFile: string, status = 200): FakeWsfeBehavior {
  return { kind: "answers", status, responseFile };
}

export function answersWhenReleased(responseFile: string, status = 200): FakeWsfeBehavior {
  return { kind: "answers-when-released", status, responseFile };
}

export const NO_ANSWER = null;

export function answersInTurn(...responseFiles: (string | typeof NO_ANSWER)[]): FakeWsfeBehavior {
  return {
    kind: "answers-in-turn",
    steps: responseFiles.map((responseFile) =>
      responseFile === NO_ANSWER ? undefined : { status: 200, responseFile },
    ),
  };
}

function answerTo(behavior: FakeWsfeBehavior, request: number): FakeWsfeAnswer | undefined {
  switch (behavior.kind) {
    case "answers":
    case "answers-when-released":
      return behavior;
    case "answers-in-turn":
      return behavior.steps[Math.min(request, behavior.steps.length - 1)];
    case "never-answers":
      return undefined;
  }
}

export async function startFakeWsfeServer(
  initial: FakeWsfeBehavior = answers("fe-dummy-all-ok.xml"),
): Promise<FakeWsfeServer> {
  let behavior = initial;
  const requests: string[] = [];
  const held: (() => void)[] = [];
  const requestWaiters: (() => void)[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const answer = answerTo(behavior, requests.length);
      requests.push(Buffer.concat(chunks).toString("utf8"));
      for (const waiter of requestWaiters.splice(0)) {
        waiter();
      }
      if (answer === undefined) {
        return;
      }
      const body = readFileSync(new URL(answer.responseFile, RESPONSES_DIR));
      const send = () => {
        response.writeHead(answer.status, { "content-type": "text/xml; charset=utf-8" });
        response.end(body);
      };
      if (behavior.kind === "answers-when-released") {
        held.push(send);
      } else {
        send();
      }
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
    nextRequest: () => new Promise<void>((resolve) => requestWaiters.push(resolve)),
    release() {
      for (const send of held.splice(0)) {
        send();
      }
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
