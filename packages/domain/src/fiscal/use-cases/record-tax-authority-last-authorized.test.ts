import { describe, expect, it } from "vitest";
import { recordTaxAuthorityLastAuthorized } from "./record-tax-authority-last-authorized.js";
import type { LastAuthorizedAnswer } from "./tax-authority-count-ports.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakeLastAuthorizedLookup,
  FakeTaxAuthorityCounts,
} from "./test-support/fake-tax-authority-count.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-01T08:00:00.000Z"),
  expiresAt: new Date("2026-10-01T20:00:00.000Z"),
};

function record({
  token = TOKEN,
  answer = { kind: "read", number: 38 },
}: {
  token?: typeof TOKEN | null;
  answer?: LastAuthorizedAnswer;
} = {}) {
  const taxAuthority = new FakeLastAuthorizedLookup(answer);
  const counts = new FakeTaxAuthorityCounts();
  const outcome = recordTaxAuthorityLastAuthorized(
    {
      tokens: { validToken: async () => token },
      taxAuthority,
      counts,
      clock: new ManualClock(NOW),
    },
    { pointOfSale: 12 },
  );
  return { taxAuthority, counts, outcome };
}

describe("recordTaxAuthorityLastAuthorized", () => {
  it("asks the tax authority for the point of sale's last authorized number and records it with the time it was read", async () => {
    const { taxAuthority, counts, outcome } = record();

    await expect(outcome).resolves.toEqual({ kind: "recorded" });
    expect(taxAuthority.lookups).toEqual([{ token: TOKEN, pointOfSale: 12 }]);
    expect(counts.recorded).toEqual([{ pointOfSale: 12, lastAuthorized: 38, readAt: NOW }]);
  });

  it("records a point of sale that never authorized anything as zero", async () => {
    const { counts, outcome } = record({ answer: { kind: "read", number: 0 } });

    await expect(outcome).resolves.toEqual({ kind: "recorded" });
    expect(counts.recorded).toEqual([{ pointOfSale: 12, lastAuthorized: 0, readAt: NOW }]);
  });

  it("asks and records nothing without a valid token", async () => {
    const { taxAuthority, counts, outcome } = record({ token: null });

    await expect(outcome).resolves.toEqual({ kind: "no_token" });
    expect(taxAuthority.lookups).toEqual([]);
    expect(counts.recorded).toEqual([]);
  });

  it("records nothing when the tax authority gives no answer", async () => {
    const { counts, outcome } = record({ answer: { kind: "no_answer" } });

    await expect(outcome).resolves.toEqual({ kind: "no_answer" });
    expect(counts.recorded).toEqual([]);
  });
});
