import { cloudError } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { CloudPullFeed } from "./cloud-pull-feed";

const LOCATION_ID = "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10";

const settingsRow = {
  address: "Av. Belgrano 1450, CABA",
  whatsapp_number: "",
  instagram_handle: "",
  monday_hours: [],
  tuesday_hours: [],
  wednesday_hours: [],
  thursday_hours: [],
  friday_hours: [],
  saturday_hours: [],
  sunday_hours: [],
  expiring_lot_alert_days: 30,
  unreviewed_price_alert_days: 30,
  good_condition_return_days: 15,
  version: 2,
};

const change = {
  change_seq: 5,
  entity: "branch_settings",
  entity_id: LOCATION_ID,
  row: settingsRow,
};

function feedAnswering(response: CloudResponse) {
  const requests: { path: string; headers: Record<string, string> }[] = [];
  const feed = new CloudPullFeed(async (path, headers) => {
    requests.push({ path, headers });
    return response;
  }, "prefix.secret");
  return { feed, requests };
}

describe("the cloud's pull, as the register reads it", () => {
  it("asks for the page after the cursor with the device token", async () => {
    const { feed, requests } = feedAnswering({
      kind: "ok",
      body: { changes: [], cursor: 4, has_more: false },
    });

    await feed.pageAfter(4);

    expect(requests).toEqual([
      { path: "/api/changes?since=4", headers: { authorization: "Bearer prefix.secret" } },
    ]);
  });

  it("reads a page with each change, its cursor and whether more wait", async () => {
    const { feed } = feedAnswering({
      kind: "ok",
      body: { changes: [change], cursor: 5, has_more: true },
    });

    expect(await feed.pageAfter(4)).toEqual({
      kind: "page",
      page: { changes: [{ changeSeq: 5, change }], cursor: 5, hasMore: true },
    });
  });

  it("fails on a body that is not a page", async () => {
    const { feed } = feedAnswering({ kind: "ok", body: { changes: "nope" } });

    expect(await feed.pageAfter(4)).toEqual({ kind: "failed", failure: { kind: "unreadable" } });
  });

  it("fails naming the cloud's refusal", async () => {
    const { feed } = feedAnswering({
      kind: "error",
      error: cloudError("device_token_rejected", "the device token is not recognized"),
    });

    expect(await feed.pageAfter(4)).toEqual({
      kind: "failed",
      failure: { kind: "refused", code: "device_token_rejected" },
    });
  });

  it("fails when the cloud can't be reached", async () => {
    const { feed } = feedAnswering({ kind: "unreachable" });

    expect(await feed.pageAfter(4)).toEqual({ kind: "failed", failure: { kind: "unreachable" } });
  });
});
