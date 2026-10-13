import type {
  FindCountableProductOutcome,
  ReadInitialCountOutcome,
  RecordInitialCountLineOutcome,
  SearchCountableProductsOutcome,
  StockRendererToCoreMessage,
  WeighCountedProductOutcome,
  WithdrawInitialCountLineOutcome,
} from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { answerInitialCountRequest, type InitialCountRequests } from "./initial-count-answers";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

const READ: ReadInitialCountOutcome = { kind: "read", offered: true, lines: [] };
const RECORDED: RecordInitialCountLineOutcome = { kind: "not_offered" };
const WITHDRAWN: WithdrawInitialCountLineOutcome = { kind: "withdrawn" };
const FOUND: FindCountableProductOutcome = { kind: "unknown_code" };
const SEARCHED: SearchCountableProductsOutcome = { kind: "results", products: [], more: false };
const WEIGHED: WeighCountedProductOutcome = { kind: "weighed", weight_thousandths: 1250 };

function requests() {
  const calls: unknown[][] = [];
  const answering: InitialCountRequests = {
    read: async () => {
      calls.push(["read"]);
      return READ;
    },
    record: async (request) => {
      calls.push(["record", request]);
      return RECORDED;
    },
    withdraw: async (movementId) => {
      calls.push(["withdraw", movementId]);
      return WITHDRAWN;
    },
    find: async (code) => {
      calls.push(["find", code]);
      return FOUND;
    },
    search: async (query) => {
      calls.push(["search", query]);
      return SEARCHED;
    },
    weigh: async (productId) => {
      calls.push(["weigh", productId]);
      return WEIGHED;
    },
  };
  return { answering, calls };
}

const MESSAGES: [StockRendererToCoreMessage, unknown[], unknown][] = [
  [{ type: "read-initial-count", request_id: REQUEST_ID }, ["read"], READ],
  [
    {
      type: "record-initial-count-line",
      request_id: REQUEST_ID,
      product_id: "p1",
      counted: 6000,
      expires_on: "2026-12-31",
    },
    ["record", { productId: "p1", counted: 6000, expiresOn: "2026-12-31" }],
    RECORDED,
  ],
  [
    { type: "withdraw-initial-count-line", request_id: REQUEST_ID, movement_id: "m1" },
    ["withdraw", "m1"],
    WITHDRAWN,
  ],
  [
    { type: "find-countable-product", request_id: REQUEST_ID, code: "7790001" },
    ["find", "7790001"],
    FOUND,
  ],
  [
    { type: "search-countable-products", request_id: REQUEST_ID, query: "yer" },
    ["search", "yer"],
    SEARCHED,
  ],
  [
    { type: "weigh-counted-product", request_id: REQUEST_ID, product_id: "p2" },
    ["weigh", "p2"],
    WEIGHED,
  ],
];

describe("answering a request to count the initial stock", () => {
  it.each(MESSAGES)(
    "answers %j with the outcome of its request",
    async (message, call, outcome) => {
      const { answering, calls } = requests();

      const answer = await answerInitialCountRequest(
        { initialCount: answering, reportFailure: () => {} },
        message,
      );

      expect(answer).toEqual({ type: `${message.type}-result`, request_id: REQUEST_ID, outcome });
      expect(calls).toEqual([call]);
    },
  );

  it.each(MESSAGES)(
    "answers unavailable to %j when the register has no database",
    async (message) => {
      const answer = await answerInitialCountRequest(
        { initialCount: undefined, reportFailure: () => {} },
        message,
      );

      expect(answer).toEqual({
        type: `${message.type}-result`,
        request_id: REQUEST_ID,
        outcome: { kind: "unavailable" },
      });
    },
  );

  it.each(MESSAGES)("answers unavailable to %j when it fails, and reports why", async (message) => {
    const error = new Error("database is locked");
    const failing = async () => {
      throw error;
    };
    const failures: { context: string; error: unknown }[] = [];

    const answer = await answerInitialCountRequest(
      {
        initialCount: {
          read: failing,
          record: failing,
          withdraw: failing,
          find: failing,
          search: failing,
          weigh: failing,
        },
        reportFailure: (context, reported) => failures.push({ context, error: reported }),
      },
      message,
    );

    expect(answer).toEqual({
      type: `${message.type}-result`,
      request_id: REQUEST_ID,
      outcome: { kind: "unavailable" },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.error).toBe(error);
    expect(failures[0]?.context).toEqual(expect.any(String));
  });
});
