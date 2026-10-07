import { describe, expect, it } from "vitest";
import type { BuyerTaxStatusOption } from "../model/buyer-tax-status-set.js";
import type { BuyerTaxStatusFetchResult } from "./buyer-tax-status-source.js";
import { fetchBuyerTaxStatusSet } from "./fetch-buyer-tax-status-set.js";
import { FakeWsaaTokenReader } from "./test-support/fake-arca-online-status.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import { FakeBuyerTaxStatusSource } from "./test-support/fake-buyer-tax-status-source.js";
import { FakeBuyerTaxStatusStore } from "./test-support/fake-buyer-tax-status-store.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const AN_HOUR_LATER = new Date("2026-10-01T13:00:00.000Z");
const A_MINUTE_LATER = new Date("2026-10-01T12:01:00.000Z");
const SERVICE = "wsfe";
const FINGERPRINT = "AA:BB";

const a: BuyerTaxStatusOption = {
  code: 901,
  description: "Condicion de prueba A",
  invoiceClass: "A",
};
const b: BuyerTaxStatusOption = {
  code: 902,
  description: "Condicion de prueba B",
  invoiceClass: "C",
};

const validToken = {
  token: "FICTIONAL-TOKEN-0001",
  sign: "FICTIONAL-SIGN-0001",
  issuedAt: new Date("2026-10-01T06:00:00.000Z"),
  expiresAt: new Date("2026-10-01T18:00:00.000Z"),
};

function setUp(result: BuyerTaxStatusFetchResult, whileFetching?: (clock: ManualClock) => void) {
  const clock = new ManualClock(NOW);
  const tokens = new FakeWsaaTokenReader();
  const store = new FakeBuyerTaxStatusStore();
  const source = new FakeBuyerTaxStatusSource(result, () => whileFetching?.(clock));
  const fetch = () =>
    fetchBuyerTaxStatusSet(
      { tokens, source, store, clock },
      { service: SERVICE, certificateFingerprint: FINGERPRINT },
    );
  return { clock, tokens, store, source, fetch };
}

describe("fetchBuyerTaxStatusSet", () => {
  it("records a fetched set that differs from the current one as its next version", async () => {
    const { tokens, store, fetch } = setUp({ kind: "fetched", options: [a, b] });
    tokens.seed(SERVICE, FINGERPRINT, validToken);
    store.seedVersion({ paramsVersion: 3, options: [a] });

    const outcome = await fetch();

    expect(outcome).toEqual({ kind: "recorded", paramsVersion: 4, nextFetchAt: AN_HOUR_LATER });
    expect(store.snapshot()).toEqual([
      { paramsVersion: 3, options: [a] },
      { paramsVersion: 4, options: [a, b] },
    ]);
  });

  it("records nothing when the fetched set is the current one", async () => {
    const { tokens, store, fetch } = setUp({ kind: "fetched", options: [b, a] });
    tokens.seed(SERVICE, FINGERPRINT, validToken);
    store.seedVersion({ paramsVersion: 2, options: [a, b] });

    const outcome = await fetch();

    expect(outcome).toEqual({ kind: "unchanged", paramsVersion: 2, nextFetchAt: AN_HOUR_LATER });
    expect(store.snapshot()).toEqual([{ paramsVersion: 2, options: [a, b] }]);
  });

  it("keeps the current version when ARCA answers a set that is not valid", async () => {
    const { tokens, store, fetch } = setUp({ kind: "fetched", options: [] });
    tokens.seed(SERVICE, FINGERPRINT, validToken);
    store.seedVersion({ paramsVersion: 2, options: [a] });

    const outcome = await fetch();

    expect(outcome).toEqual({ kind: "invalid_set", nextFetchAt: AN_HOUR_LATER });
    expect(store.snapshot()).toEqual([{ paramsVersion: 2, options: [a] }]);
  });

  it("keeps the current version when the fetch fails, fetching again a minute later", async () => {
    const { tokens, store, fetch } = setUp({ kind: "failed" });
    tokens.seed(SERVICE, FINGERPRINT, validToken);
    store.seedVersion({ paramsVersion: 2, options: [a] });

    const outcome = await fetch();

    expect(outcome).toEqual({ kind: "fetch_failed", nextFetchAt: A_MINUTE_LATER });
    expect(store.snapshot()).toEqual([{ paramsVersion: 2, options: [a] }]);
    expect(store.transactionCount).toBe(0);
  });

  it("fetches with the persisted token of the service and certificate", async () => {
    const { tokens, source, fetch } = setUp({ kind: "fetched", options: [a] });
    tokens.seed(SERVICE, "OTHER:CERTIFICATE", { ...validToken, token: "OTHER-TOKEN" });
    tokens.seed(SERVICE, FINGERPRINT, validToken);

    await fetch();

    expect(tokens.reads).toEqual([{ service: SERVICE, certificateFingerprint: FINGERPRINT }]);
    expect(source.fetchedWith).toEqual([validToken]);
  });

  it.each([
    ["no persisted token", undefined],
    ["a persisted token that expired", { ...validToken, expiresAt: NOW }],
  ])(
    "does not fetch with %s, keeping the current version and trying again a minute later",
    async (_case, token) => {
      const { tokens, store, source, fetch } = setUp({ kind: "fetched", options: [a, b] });
      if (token) {
        tokens.seed(SERVICE, FINGERPRINT, token);
      }
      store.seedVersion({ paramsVersion: 2, options: [a] });

      const outcome = await fetch();

      expect(outcome).toEqual({ kind: "no_valid_token", nextFetchAt: A_MINUTE_LATER });
      expect(source.fetchedWith).toEqual([]);
      expect(store.snapshot()).toEqual([{ paramsVersion: 2, options: [a] }]);
    },
  );

  it("asks ARCA before it takes the current set's lock", async () => {
    let transactionsWhileFetching: number | undefined;
    const store = new FakeBuyerTaxStatusStore();
    const tokens = new FakeWsaaTokenReader();
    tokens.seed(SERVICE, FINGERPRINT, validToken);
    const source = new FakeBuyerTaxStatusSource({ kind: "fetched", options: [a] }, () => {
      transactionsWhileFetching = store.transactionCount;
    });

    await fetchBuyerTaxStatusSet(
      { tokens, source, store, clock: new ManualClock(NOW) },
      { service: SERVICE, certificateFingerprint: FINGERPRINT },
    );

    expect(transactionsWhileFetching).toBe(0);
    expect(store.transactionCount).toBe(1);
  });

  it("counts the next fetch from when this one ended", async () => {
    const { tokens, fetch } = setUp({ kind: "fetched", options: [a] }, (clock) =>
      clock.advanceBy(10_000),
    );
    tokens.seed(SERVICE, FINGERPRINT, validToken);

    const outcome = await fetch();

    expect(outcome.nextFetchAt).toEqual(new Date("2026-10-01T13:00:10.000Z"));
  });
});
