import { describe, expect, it } from "vitest";
import { catchUpWithCloud } from "./catch-up-with-cloud.js";
import type { PulledChange, PullPage } from "./sync-ports.js";
import {
  FakeCloudChangeFeed,
  type FakeFeedAnswer,
  FakeLocalReplica,
} from "./test-support/fake-local-replica.js";

function page(firstSeq: number, count: number, hasMore: boolean): FakeFeedAnswer {
  const changes = Array.from({ length: count }, (_, index) => ({ changeSeq: firstSeq + index }));
  return {
    kind: "page",
    page: { changes, cursor: changes.at(-1)?.changeSeq ?? firstSeq - 1, hasMore },
  };
}

function catchUp(replica: FakeLocalReplica, feed: FakeCloudChangeFeed) {
  return catchUpWithCloud({ replica, feed });
}

describe("catching up with the cloud", () => {
  it("pulls a brand-new installation from the very first cursor", async () => {
    const replica = new FakeLocalReplica();
    const feed = new FakeCloudChangeFeed([page(1, 3, false)]);

    const outcome = await catchUp(replica, feed);

    expect(feed.askedFrom).toEqual([0]);
    expect(outcome).toEqual({ kind: "caught_up", cursor: 3 });
    expect(replica.cursor).toBe(3);
  });

  it("keeps asking for the next page until none is left, saving each page with its own cursor", async () => {
    const replica = new FakeLocalReplica();
    const feed = new FakeCloudChangeFeed([
      page(1, 500, true),
      page(501, 500, true),
      page(1001, 2, false),
    ]);

    const outcome = await catchUp(replica, feed);

    expect(feed.askedFrom).toEqual([0, 500, 1000]);
    expect(replica.savedPages.map((saved: PullPage<PulledChange>) => saved.cursor)).toEqual([
      500, 1000, 1002,
    ]);
    expect(replica.appliedChanges).toHaveLength(1002);
    expect(outcome).toEqual({ kind: "caught_up", cursor: 1002 });
  });

  it("resumes from the cursor it already saved, however long ago", async () => {
    const replica = new FakeLocalReplica(12);
    const feed = new FakeCloudChangeFeed([page(13, 0, false)]);

    const outcome = await catchUp(replica, feed);

    expect(feed.askedFrom).toEqual([12]);
    expect(outcome).toEqual({ kind: "caught_up", cursor: 12 });
    expect(replica.savedPages).toEqual([{ changes: [], cursor: 12, hasMore: false }]);
  });

  it("keeps the pages it already saved when a later page fails, and resumes from them next time", async () => {
    const replica = new FakeLocalReplica();
    const interrupted = new FakeCloudChangeFeed([
      page(1, 500, true),
      { kind: "failed", failure: "unreachable" },
    ]);

    const outcome = await catchUp(replica, interrupted);

    expect(outcome).toEqual({ kind: "failed", failure: "unreachable", cursor: 500 });
    expect(replica.cursor).toBe(500);

    const resumed = new FakeCloudChangeFeed([page(501, 1, false)]);
    expect(await catchUp(replica, resumed)).toEqual({ kind: "caught_up", cursor: 501 });
    expect(resumed.askedFrom).toEqual([500]);
    expect(replica.appliedChanges).toHaveLength(501);
  });

  const emptyPageSayingMoreWait: FakeFeedAnswer = {
    kind: "page",
    page: { changes: [], cursor: 3, hasMore: true },
  };

  it.each([
    ["a page delivered again", page(1, 2, false)],
    ["a page from further back", page(2, 3, false)],
    ["a page that says more wait but carries nothing", emptyPageSayingMoreWait],
  ])("saves nothing from %s and stops", async (_case, answer) => {
    const replica = new FakeLocalReplica(3);
    const feed = new FakeCloudChangeFeed([answer]);

    const outcome = await catchUp(replica, feed);

    expect(outcome).toEqual({ kind: "page_out_of_order", cursor: 3 });
    expect(replica.savedPages).toEqual([]);
  });
});
