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
  firstPinCodeBodySchema,
  firstPinCodeSchema,
  pinCodeRedemptionBodySchema,
  pinCodeRedemptionSchema,
  pushEventsRequestSchema,
  pushEventsResponseSchema,
  type SyncChange,
  signInLookupBodySchema,
  signInLookupSchema,
} from "@purosur/contracts";
import { PULL_PAGE_MAX_CHANGES } from "@purosur/domain";
import { type CloudChange, pinRecord } from "./cloud-changes";

export interface StandInCloud {
  readonly url: string;
  readonly enrollmentCode: string;
  readonly feedStored: Promise<void>;
  stop(): Promise<void>;
}

export interface StandInCloudOptions {
  readonly signInLookups?: Readonly<Record<string, { userId: string; hasPin: boolean }>>;
  readonly firstPinCodes?: Readonly<Record<string, string>>;
}

const ENROLLMENT_CODE = "ABCD2345EFGH6723";
const FIRST_PIN_CODE_MINUTES = 15;

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

export async function startStandInCloud(
  changes: readonly CloudChange[],
  options: StandInCloudOptions = {},
): Promise<StandInCloud> {
  const feed = numbered(changes);
  const lastChangeSeq = feed.at(-1)?.change_seq ?? 0;
  const deviceToken = randomUUID();
  const problems: string[] = [];
  const firstPinCodes: Record<string, string> = { ...options.firstPinCodes };
  let markFeedStored = () => {};
  let markFeedRefused = (_problem: Error) => {};
  const feedStored = new Promise<void>((resolve, reject) => {
    markFeedStored = resolve;
    markFeedRefused = reject;
  });
  feedStored.catch(() => {});

  function fail(problem: string): void {
    problems.push(problem);
    markFeedRefused(new Error(`the stand-in cloud refused the register: ${problem}`));
  }

  async function enroll(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = deviceEnrollmentBodySchema.parse(await jsonBody(request));
    if (body.code !== ENROLLMENT_CODE) {
      fail(`enrollment code ${body.code}`);
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
      fail("a pull without the device token it was issued");
      refuse(response, "device_token_rejected");
      return;
    }
    const { since } = changesQuerySchema.parse({ since: url.searchParams.get("since") });
    if (since >= lastChangeSeq) {
      markFeedStored();
    }
    const pending = feed
      .filter((change) => change.change_seq > since)
      .slice(0, PULL_PAGE_MAX_CHANGES);
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

  async function answerSignInLookup(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.headers.authorization !== `Bearer ${deviceToken}`) {
      fail("a sign-in lookup without the device token it was issued");
      refuse(response, "device_token_rejected");
      return;
    }
    const { email } = signInLookupBodySchema.parse(await jsonBody(request));
    const person = options.signInLookups?.[email];
    send(
      response,
      200,
      signInLookupSchema.parse(
        person === undefined
          ? { kind: "not_found" }
          : { kind: "found", user_id: person.userId, has_pin: person.hasPin },
      ),
    );
  }

  function hasDeviceToken(request: IncomingMessage, response: ServerResponse, what: string) {
    if (request.headers.authorization === `Bearer ${deviceToken}`) {
      return true;
    }
    fail(`${what} without the device token it was issued`);
    refuse(response, "device_token_rejected");
    return false;
  }

  async function answerEventPush(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (!hasDeviceToken(request, response, "an event push")) {
      return;
    }
    const { events } = pushEventsRequestSchema.parse(await jsonBody(request));
    const ackSeq = Math.max(...events.map((event) => event.device_seq));
    send(response, 200, pushEventsResponseSchema.parse({ status: "ok", ack_seq: ackSeq }));
  }

  async function answerFirstPinCode(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (!hasDeviceToken(request, response, "a first PIN code request")) {
      return;
    }
    const { user_id } = firstPinCodeBodySchema.parse(await jsonBody(request));
    if (firstPinCodes[user_id] === undefined) {
      refuse(response, "not_found");
      return;
    }
    const expiresAt = new Date(Date.now() + FIRST_PIN_CODE_MINUTES * 60_000);
    send(response, 201, firstPinCodeSchema.parse({ expires_at: expiresAt.toISOString() }));
  }

  async function answerPinCodeRedemption(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (!hasDeviceToken(request, response, "a PIN code redemption")) {
      return;
    }
    const { reset_code, new_pin } = pinCodeRedemptionBodySchema.parse(await jsonBody(request));
    const userId = Object.keys(firstPinCodes).find((id) => firstPinCodes[id] === reset_code);
    if (userId === undefined) {
      refuse(response, "reset_code_invalid");
      return;
    }
    delete firstPinCodes[userId];
    send(
      response,
      200,
      pinCodeRedemptionSchema.parse({ user_id: userId, ...(await pinRecord(new_pin)) }),
    );
  }

  async function answer(
    route: string,
    url: URL,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (route === "POST /api/devices") {
      await enroll(request, response);
    } else if (route === "POST /api/sign-in-lookups") {
      await answerSignInLookup(request, response);
    } else if (route === "POST /api/first-pin-codes") {
      await answerFirstPinCode(request, response);
    } else if (route === "POST /api/pin-code-redemptions") {
      await answerPinCodeRedemption(request, response);
    } else if (route === "POST /api/events") {
      await answerEventPush(request, response);
    } else if (route === "GET /api/changes") {
      pageAfter(url, request, response);
    } else {
      fail(`${route} has no answer`);
      response.writeHead(404).end();
    }
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stand-in");
    const route = `${request.method} ${url.pathname}`;
    answer(route, url, request, response).catch((error: unknown) => {
      fail(`${route} failed: ${error}`);
      refuse(response, "internal_error");
    });
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
      if (problems.length > 0) {
        throw new Error(`the stand-in cloud refused the register: ${problems.join("; ")}`);
      }
    },
  };
}
