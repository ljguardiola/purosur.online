import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { collectAiCalls } from "./ai-call-recording.js";
import type { AiCallUsage } from "./ai-call-usage.js";

const NOW = new Date("2026-03-11T01:30:00Z");
const CONTEXT = {
  purpose: "LINK_PROPOSAL" as const,
  listId: "list-1",
  rowId: "row-1",
  actorId: "person-1",
};

function anAttempt(
  overrides: Partial<AiCallUsage["attempts"][number]> = {},
): AiCallUsage["attempts"][number] {
  return {
    model: "claude-sonnet-5-5",
    inputTokens: 1_000_000,
    outputTokens: 100_000,
    cacheWriteTokens: 40_000,
    cacheReadTokens: 500_000,
    ...overrides,
  };
}

function collectorAt(at = NOW) {
  return collectAiCalls(() => at, new FakeZoneRulesSource());
}

describe("collectAiCalls", () => {
  it("records each attempt of each call with its context, tokens, its call's outcome and its cost", () => {
    const collector = collectorAt();
    collector.onCall({ outcome: "completed", attempts: [anAttempt()] });
    collector.onCall({
      outcome: "cut_short",
      attempts: [
        anAttempt({
          model: "claude-sonnet-5",
          inputTokens: 10,
          outputTokens: 20,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
        }),
        anAttempt({ inputTokens: 5, outputTokens: 6, cacheWriteTokens: 7, cacheReadTokens: 8 }),
      ],
    });

    expect(collector.records(CONTEXT)).toEqual([
      {
        ...CONTEXT,
        occurredAt: NOW,
        occurredOn: "2026-03-10",
        model: "claude-sonnet-5-5",
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheWriteTokens: 40_000,
        cacheReadTokens: 500_000,
        outcome: "completed",
        costNanoUsd: 2_000_000_000 + 1_000_000_000 + 100_000_000 + 100_000_000,
      },
      {
        ...CONTEXT,
        occurredAt: NOW,
        occurredOn: "2026-03-10",
        model: "claude-sonnet-5",
        inputTokens: 10,
        outputTokens: 20,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        outcome: "cut_short",
        costNanoUsd: 20_000 + 200_000,
      },
      {
        ...CONTEXT,
        occurredAt: NOW,
        occurredOn: "2026-03-10",
        model: "claude-sonnet-5-5",
        inputTokens: 5,
        outputTokens: 6,
        cacheWriteTokens: 7,
        cacheReadTokens: 8,
        outcome: "cut_short",
        costNanoUsd: 10_000 + 60_000 + 17_500 + 1_600,
      },
    ]);
  });

  it("dates each call with the clock when it is reported, on the Argentina day", () => {
    let clock = new Date("2026-03-11T02:59:00Z");
    const collector = collectAiCalls(() => clock, new FakeZoneRulesSource());
    collector.onCall({ outcome: "completed", attempts: [anAttempt()] });
    clock = new Date("2026-03-11T03:00:00Z");
    collector.onCall({ outcome: "completed", attempts: [anAttempt()] });
    clock = new Date("2026-03-12T12:00:00Z");

    expect(
      collector.records(CONTEXT).map(({ occurredAt, occurredOn }) => [occurredAt, occurredOn]),
    ).toEqual([
      [new Date("2026-03-11T02:59:00Z"), "2026-03-10"],
      [new Date("2026-03-11T03:00:00Z"), "2026-03-11"],
    ]);
  });

  it("records nothing of a call that reported no attempt", () => {
    const collector = collectorAt();
    collector.onCall({ outcome: "failed", attempts: [] });

    expect(collector.records(CONTEXT)).toEqual([]);
  });

  it("records a model without a price with its tokens and no cost", () => {
    const collector = collectorAt();
    collector.onCall({
      outcome: "completed",
      attempts: [anAttempt({ model: "claude-future-9", inputTokens: 123 })],
    });

    expect(collector.records(CONTEXT)).toEqual([
      expect.objectContaining({ model: "claude-future-9", inputTokens: 123, costNanoUsd: null }),
    ]);
  });

  it("prices a call with the price in effect when it was reported", () => {
    const collector = collectorAt(new Date("2025-12-31T23:59:59Z"));
    collector.onCall({ outcome: "completed", attempts: [anAttempt()] });

    expect(collector.records(CONTEXT)[0]?.costNanoUsd).toBeNull();
  });

  it("has attempts only once some reported call had one", () => {
    const collector = collectorAt();
    expect(collector.hasAttempts()).toBe(false);

    collector.onCall({ outcome: "failed", attempts: [] });
    expect(collector.hasAttempts()).toBe(false);

    collector.onCall({ outcome: "completed", attempts: [anAttempt()] });
    expect(collector.hasAttempts()).toBe(true);
  });
});
