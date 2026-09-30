import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type CloudErrorCode,
  changesPageSchema,
  changesQuerySchema,
  cloudError,
  cloudErrorStatus,
  deviceEnrollmentBodySchema,
  deviceEnrollmentSchema,
  type SyncChange,
} from "@purosur/contracts";
import type { CloudChange } from "./cloud-changes";

export interface StandInCloud {
  readonly url: string;
  readonly enrollmentCode: string;
  readonly feedStored: Promise<void>;
  stop(): Promise<void>;
}

const ENROLLMENT_CODE = "ABCD2345EFGH6723";

function installationKey(fill: number): string {
  return Buffer.alloc(32, fill).toString("base64");
}

function numbered(changes: readonly CloudChange[]): SyncChange[] {
  return changes.map((change, index) => ({ ...change, change_seq: index + 1 }) as SyncChange);
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function refuse(response: ServerResponse, code: CloudErrorCode): void {
  send(response, cloudErrorStatus(code), cloudError(code, code));
}

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
  }
  return JSON.parse(text);
}

export async function startStandInCloud(changes: readonly CloudChange[]): Promise<StandInCloud> {
  const feed = numbered(changes);
  const lastChangeSeq = feed.at(-1)?.change_seq ?? 0;
  const deviceToken = randomUUID();
  const unexpected: string[] = [];
  let markFeedStored = () => {};
  const feedStored = new Promise<void>((resolve) => {
    markFeedStored = resolve;
  });

  async function enroll(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = deviceEnrollmentBodySchema.parse(await jsonBody(request));
    if (body.code !== ENROLLMENT_CODE) {
      refuse(response, "enrollment_code_rejected");
      return;
    }
    send(
      response,
      200,
      deviceEnrollmentSchema.parse({
        device_id: randomUUID(),
        device_token: deviceToken,
        snapshot_key_versions: [{ version: 1, key: installationKey(1) }],
        contingency_ticket_key: { version: 1, key: installationKey(2) },
        outbox_chain_key: installationKey(3),
      }),
    );
  }

  // Every feed ends with an empty page the register has to ask for, so its request proves the
  // page before it was stored.
  function pageAfter(url: URL, request: IncomingMessage, response: ServerResponse): void {
    if (request.headers.authorization !== `Bearer ${deviceToken}`) {
      refuse(response, "device_token_rejected");
      return;
    }
    const { since } = changesQuerySchema.parse({ since: url.searchParams.get("since") });
    if (since >= lastChangeSeq) {
      markFeedStored();
    }
    const pending = feed.filter((change) => change.change_seq > since);
    send(
      response,
      200,
      changesPageSchema.parse({
        changes: pending,
        cursor: pending.at(-1)?.change_seq ?? since,
        has_more: pending.length > 0,
      }),
    );
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stand-in");
    const route = `${request.method} ${url.pathname}`;
    if (route === "POST /api/devices") {
      enroll(request, response).catch(() => refuse(response, "validation_failed"));
    } else if (route === "GET /api/changes") {
      pageAfter(url, request, response);
    } else {
      unexpected.push(route);
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    enrollmentCode: ENROLLMENT_CODE,
    feedStored,
    stop: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (unexpected.length > 0) {
        throw new Error(
          `the register made calls the stand-in cloud does not answer: ${unexpected}`,
        );
      }
    },
  };
}
