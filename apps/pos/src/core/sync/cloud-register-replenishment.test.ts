import { cloudError, registerResetRequestSchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { CloudRegisterReplenishment } from "./cloud-register-replenishment";

const PREDECESSOR = {
  deviceId: "2f0c7a9e-8d1b-4c53-9a77-3b5e1d2c4f60",
  lastAcknowledgedSeq: 52,
};
const OTHER_DEVICE = "9b1e5f3a-6c2d-4e8f-a1b7-0d4c8e2f6a13";

function wireEvent(deviceSeq: number, deviceId = PREDECESSOR.deviceId) {
  return {
    device_id: deviceId,
    event_id: `018f0000-0000-7000-8000-${String(deviceSeq).padStart(12, "0")}`,
    device_seq: deviceSeq,
    aggregate_type: "CashSession",
    aggregate_id: "session-1",
    event_type: "cash_session_opened",
    schema_version: 1,
    payload: { opening_float: 5000 },
    occurred_at: "2026-09-30T12:00:00.000Z",
    actor_id: "u1",
    chain_hmac: "Y2hhaW4=",
  };
}

const WIRE_USER = {
  user_id: "5d3a8c1e-7f2b-4a94-b6d0-1e9c3f7a2b48",
  first_name: "Ana",
  role_id: "7c2e9a4b-1d5f-4b83-a0c6-8f3d2e1b5a79",
  salt: "salt",
  pin_hash: "$argon2id$hash",
  active: true,
  version: 3,
};

function feedAnswering(response: CloudResponse) {
  const requests: { path: string; bearerToken: string; body: unknown }[] = [];
  const feed = new CloudRegisterReplenishment({
    post: async (path, bearerToken, body) => {
      requests.push({ path, bearerToken, body });
      return response;
    },
    deviceToken: "prefix.secret",
  });
  return { feed, requests };
}

describe("the cloud's replenishment of a restored register, as the register reads it", () => {
  it("asks for the events after the predecessor's last acknowledged one, using the device token", async () => {
    const { feed, requests } = feedAnswering({
      kind: "ok",
      body: { events: [], next: null, users: [], credit_notes: [] },
    });

    await feed.pageAfter(PREDECESSOR, undefined);

    expect(requests).toEqual([
      {
        path: "/api/devices/current/reset",
        bearerToken: "prefix.secret",
        body: {
          predecessor_device_id: PREDECESSOR.deviceId,
          last_acknowledged_seq: 52,
        },
      },
    ]);
    expect(registerResetRequestSchema.safeParse(requests[0]?.body).success).toBe(true);
  });

  it("continues after the event the previous page ended at", async () => {
    const { feed, requests } = feedAnswering({
      kind: "ok",
      body: { events: [], next: null, users: [], credit_notes: [] },
    });

    await feed.pageAfter(PREDECESSOR, { deviceId: OTHER_DEVICE, deviceSeq: 7 });

    expect(requests[0]?.body).toEqual({
      predecessor_device_id: PREDECESSOR.deviceId,
      last_acknowledged_seq: 52,
      after: { device_id: OTHER_DEVICE, device_seq: 7 },
    });
    expect(registerResetRequestSchema.safeParse(requests[0]?.body).success).toBe(true);
  });

  it("reads a page of events with the installation that produced each, the users and where the next page starts", async () => {
    const { feed } = feedAnswering({
      kind: "ok",
      body: {
        events: [wireEvent(53), wireEvent(1, OTHER_DEVICE)],
        next: { device_id: OTHER_DEVICE, device_seq: 1 },
        users: [WIRE_USER],
        credit_notes: [],
      },
    });

    const answer = await feed.pageAfter(PREDECESSOR, undefined);

    const { device_id: _first, ...firstEvent } = wireEvent(53);
    const { device_id: _second, ...secondEvent } = wireEvent(1, OTHER_DEVICE);
    expect(answer).toEqual({
      kind: "page",
      page: {
        events: [
          { deviceId: PREDECESSOR.deviceId, event: firstEvent },
          { deviceId: OTHER_DEVICE, event: secondEvent },
        ],
        next: { deviceId: OTHER_DEVICE, deviceSeq: 1 },
        users: [
          {
            userId: WIRE_USER.user_id,
            firstName: "Ana",
            roleId: WIRE_USER.role_id,
            salt: "salt",
            pinHash: "$argon2id$hash",
            active: true,
            version: 3,
          },
        ],
        creditNoteAnswers: [],
      },
    });
  });

  it("reads a last page that names no next one and a user without a PIN", async () => {
    const { feed } = feedAnswering({
      kind: "ok",
      body: {
        events: [],
        next: null,
        users: [{ ...WIRE_USER, salt: null, pin_hash: null }],
        credit_notes: [],
      },
    });

    const answer = await feed.pageAfter(PREDECESSOR, undefined);

    expect(answer).toMatchObject({
      kind: "page",
      page: { next: null, users: [{ salt: null, pinHash: null }] },
    });
  });

  it.each([
    "predecessor_not_of_register",
    "predecessor_not_revoked",
    "cursor_not_of_replenishment",
  ] as const)("reads the cloud's %s refusal as a refusal", async (code) => {
    const { feed } = feedAnswering({ kind: "error", error: cloudError(code, "refused") });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({
      kind: "refused",
      refusal: code,
    });
  });

  it("fails naming the cloud's other refusals", async () => {
    const { feed } = feedAnswering({
      kind: "error",
      error: cloudError("device_token_rejected", "the device token is not recognized"),
    });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({
      kind: "failed",
      failure: { kind: "refused", code: "device_token_rejected" },
    });
  });

  it("carries how long the cloud asks to wait when it refuses for asking too often", async () => {
    const { feed } = feedAnswering({
      kind: "error",
      error: cloudError("rate_limited", "too many requests", [{ retry_after_seconds: 45 }]),
    });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({
      kind: "failed",
      failure: { kind: "refused", code: "rate_limited", retryAfterSeconds: 45 },
    });
  });

  it("fails on a body that is not a page of the replenishment", async () => {
    const { feed } = feedAnswering({ kind: "ok", body: { events: [{ event_id: "x" }] } });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({
      kind: "failed",
      failure: { kind: "unreadable" },
    });
  });

  it("fails on an event that does not say which installation produced it", async () => {
    const { device_id: _missing, ...withoutInstallation } = wireEvent(53);
    const { feed } = feedAnswering({
      kind: "ok",
      body: { events: [withoutInstallation], next: null, users: [], credit_notes: [] },
    });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({
      kind: "failed",
      failure: { kind: "unreadable" },
    });
  });

  it("answers unreachable when the cloud can't be reached", async () => {
    const { feed } = feedAnswering({ kind: "unreachable" });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({ kind: "unreachable" });
  });

  describe("the credit note answers", () => {
    const SALE = "3c9d1e7a-5b24-4f86-8a0d-6e2b9c4f1a37";
    const CREDIT_NOTE = "8e4b2a6c-1d93-4075-b5f8-2a7c9e0d3b61";
    const OTHER_SALE = "5a7e2c91-3d68-4b04-a1f9-8c0b6d3e7f25";
    const OTHER_CREDIT_NOTE = "1f6a3d9b-2c47-4e85-9b10-7d5e8a2c4f93";

    function pageWith(...creditNotes: unknown[]) {
      return feedAnswering({
        kind: "ok",
        body: { events: [], next: null, users: [], credit_notes: creditNotes },
      }).feed.pageAfter(PREDECESSOR, undefined);
    }

    it("reads the authorization the tax authority gave a voided sale's credit note", async () => {
      const answer = await pageWith({
        sale_id: SALE,
        credit_note_id: CREDIT_NOTE,
        answered_at: "2026-10-07T10:30:00.000Z",
        state: "AUTHORIZED",
        point_of_sale: 7,
        number: 9,
        issued_on: "2026-10-07",
        issued_at: "2026-10-07T10:29:00.000Z",
        authorization_code: "74123456789012",
        authorization_code_due_on: "2026-10-17",
      });

      expect(answer).toMatchObject({
        kind: "page",
        page: {
          creditNoteAnswers: [
            {
              saleId: SALE,
              creditNoteId: CREDIT_NOTE,
              answeredAt: new Date("2026-10-07T10:30:00.000Z"),
              answer: {
                kind: "authorized",
                pointOfSale: 7,
                number: 9,
                issuedOn: "2026-10-07",
                issuedAt: new Date("2026-10-07T10:29:00.000Z"),
                authorizationCode: "74123456789012",
                authorizationCodeDueOn: "2026-10-17",
              },
            },
          ],
        },
      });
    });

    it("reads the rejection the tax authority gave, in the order the cloud sent the answers", async () => {
      const answer = await pageWith(
        {
          sale_id: SALE,
          credit_note_id: CREDIT_NOTE,
          answered_at: "2026-10-07T10:30:00.000Z",
          state: "REJECTED",
        },
        {
          sale_id: OTHER_SALE,
          credit_note_id: OTHER_CREDIT_NOTE,
          answered_at: "2026-10-07T10:31:00.000Z",
          state: "REJECTED",
        },
      );

      expect(answer).toMatchObject({
        kind: "page",
        page: {
          creditNoteAnswers: [
            {
              saleId: SALE,
              creditNoteId: CREDIT_NOTE,
              answeredAt: new Date("2026-10-07T10:30:00.000Z"),
              answer: { kind: "rejected" },
            },
            { saleId: OTHER_SALE, creditNoteId: OTHER_CREDIT_NOTE, answer: { kind: "rejected" } },
          ],
        },
      });
    });

    it("fails on an answer that is still in progress", async () => {
      const answer = await pageWith({
        sale_id: SALE,
        credit_note_id: CREDIT_NOTE,
        answered_at: "2026-10-07T10:30:00.000Z",
        state: "IN_PROGRESS",
      });

      expect(answer).toEqual({ kind: "failed", failure: { kind: "unreadable" } });
    });
  });
});
