import { describe, expect, it } from "vitest";
import { redeliverPulledEntities } from "./redeliver-pulled-entities.js";
import type { FakeFeedAnswer } from "./test-support/fake-local-replica.js";
import { FakeEntityChangeFeed, FakeRedeliveryReplica } from "./test-support/fake-redelivery.js";

function page(firstSeq: number, count: number, hasMore: boolean): FakeFeedAnswer {
  const changes = Array.from({ length: count }, (_, index) => ({ changeSeq: firstSeq + index }));
  return {
    kind: "page",
    page: { changes, cursor: changes.at(-1)?.changeSeq ?? firstSeq - 1, hasMore },
  };
}

function redeliver(replica: FakeRedeliveryReplica, feed: FakeEntityChangeFeed) {
  return redeliverPulledEntities({ replica, feed });
}

describe("redelivering the changes of the pulled entities", () => {
  it("asks for nothing when no entity is waiting", async () => {
    const replica = new FakeRedeliveryReplica();
    const feed = new FakeEntityChangeFeed([]);

    expect(await redeliver(replica, feed)).toEqual({ kind: "redelivered" });
    expect(feed.asked).toEqual([]);
  });

  it("asks for an entity from its own cursor, saves what comes and finishes it", async () => {
    const replica = new FakeRedeliveryReplica([{ entity: "register_point_of_sale", cursor: 0 }]);
    const feed = new FakeEntityChangeFeed([page(4, 2, false)]);

    const outcome = await redeliver(replica, feed);

    expect(outcome).toEqual({ kind: "redelivered" });
    expect(feed.asked).toEqual([{ entity: "register_point_of_sale", since: 0 }]);
    expect(replica.savedPages.map(({ entity, page: saved }) => [entity, saved.cursor])).toEqual([
      ["register_point_of_sale", 5],
    ]);
    expect(replica.finished).toEqual(["register_point_of_sale"]);
  });

  it("finishes an entity that has no change left to give", async () => {
    const replica = new FakeRedeliveryReplica([{ entity: "register_point_of_sale", cursor: 0 }]);
    const feed = new FakeEntityChangeFeed([page(1, 0, false)]);

    expect(await redeliver(replica, feed)).toEqual({ kind: "redelivered" });
    expect(replica.finished).toEqual(["register_point_of_sale"]);
  });

  it("keeps asking for the next page of an entity until none is left, finishing it only then", async () => {
    const replica = new FakeRedeliveryReplica([{ entity: "product", cursor: 0 }]);
    const feed = new FakeEntityChangeFeed([page(1, 500, true), page(501, 2, false)]);

    await redeliver(replica, feed);

    expect(feed.asked).toEqual([
      { entity: "product", since: 0 },
      { entity: "product", since: 500 },
    ]);
    expect(replica.savedPages.map(({ page: saved }) => saved.cursor)).toEqual([500, 502]);
    expect(replica.finished).toEqual(["product"]);
  });

  it("resumes an interrupted redelivery from the cursor it saved", async () => {
    const replica = new FakeRedeliveryReplica([{ entity: "product", cursor: 0 }]);
    const interrupted = new FakeEntityChangeFeed([
      page(1, 500, true),
      { kind: "failed", failure: "unreachable" },
    ]);

    expect(await redeliver(replica, interrupted)).toEqual({
      kind: "failed",
      entity: "product",
      failure: "unreachable",
      cursor: 500,
    });
    expect(replica.finished).toEqual([]);

    const resumed = new FakeEntityChangeFeed([page(501, 1, false)]);
    expect(await redeliver(replica, resumed)).toEqual({ kind: "redelivered" });
    expect(resumed.asked).toEqual([{ entity: "product", since: 500 }]);
    expect(replica.finished).toEqual(["product"]);
  });

  it("goes through every entity waiting, each from its own cursor", async () => {
    const replica = new FakeRedeliveryReplica([
      { entity: "product", cursor: 7 },
      { entity: "user", cursor: 0 },
    ]);
    const feed = new FakeEntityChangeFeed([page(8, 1, false), page(1, 1, false)]);

    expect(await redeliver(replica, feed)).toEqual({ kind: "redelivered" });
    expect(feed.asked).toEqual([
      { entity: "product", since: 7 },
      { entity: "user", since: 0 },
    ]);
    expect(replica.finished).toEqual(["product", "user"]);
  });

  it("stops at the entity whose redelivery failed, leaving the others waiting", async () => {
    const replica = new FakeRedeliveryReplica([
      { entity: "product", cursor: 0 },
      { entity: "user", cursor: 0 },
    ]);
    const feed = new FakeEntityChangeFeed([{ kind: "failed", failure: "unreachable" }]);

    const outcome = await redeliver(replica, feed);

    expect(outcome).toEqual({
      kind: "failed",
      entity: "product",
      failure: "unreachable",
      cursor: 0,
    });
    expect(feed.asked).toEqual([{ entity: "product", since: 0 }]);
    expect(replica.pending.map(({ entity }) => entity)).toEqual(["product", "user"]);
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
    const replica = new FakeRedeliveryReplica([{ entity: "product", cursor: 3 }]);

    const outcome = await redeliver(replica, new FakeEntityChangeFeed([answer]));

    expect(outcome).toEqual({ kind: "page_out_of_order", entity: "product", cursor: 3 });
    expect(replica.savedPages).toEqual([]);
    expect(replica.finished).toEqual([]);
  });
});
