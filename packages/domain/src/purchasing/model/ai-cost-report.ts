import { compareSpanishText } from "../../shared/index.js";
import type { AiCallPurpose } from "./ai-call.js";

export const AI_COST_GROUPINGS = ["day", "supplier", "person"] as const;

export type AiCostGrouping = (typeof AI_COST_GROUPINGS)[number];

export interface AiCostTotal {
  costNanoUsd: number;
  unpricedCalls: number;
}

export interface AiCost {
  reading: AiCostTotal;
  proposals: AiCostTotal;
  total: AiCostTotal;
}

export interface PricedAiCall {
  purpose: AiCallPurpose;
  costNanoUsd: number | null;
}

export interface RecordedAiCall extends PricedAiCall {
  occurredOn: string;
  supplierId: string;
  supplierName: string;
  personId: string;
  personName: string;
}

interface AiCostGroup extends AiCost {
  key: string;
  name: string | null;
}

export interface AiCostByPeriod {
  groups: AiCostGroup[];
  total: AiCost;
}

function added(total: AiCostTotal, call: PricedAiCall): AiCostTotal {
  return call.costNanoUsd === null
    ? { ...total, unpricedCalls: total.unpricedCalls + 1 }
    : { ...total, costNanoUsd: total.costNanoUsd + call.costNanoUsd };
}

export function aiCostOf(calls: readonly PricedAiCall[]): AiCost {
  let reading: AiCostTotal = { costNanoUsd: 0, unpricedCalls: 0 };
  let proposals: AiCostTotal = { costNanoUsd: 0, unpricedCalls: 0 };
  for (const call of calls) {
    if (call.purpose === "READING") {
      reading = added(reading, call);
    } else {
      proposals = added(proposals, call);
    }
  }
  return {
    reading,
    proposals,
    total: {
      costNanoUsd: reading.costNanoUsd + proposals.costNanoUsd,
      unpricedCalls: reading.unpricedCalls + proposals.unpricedCalls,
    },
  };
}

function groupOf(
  call: RecordedAiCall,
  groupBy: AiCostGrouping,
): { key: string; name: string | null } {
  switch (groupBy) {
    case "day":
      return { key: call.occurredOn, name: null };
    case "supplier":
      return { key: call.supplierId, name: call.supplierName };
    case "person":
      return { key: call.personId, name: call.personName };
  }
}

function costliestFirst(a: AiCostGroup, b: AiCostGroup): number {
  return (
    b.total.costNanoUsd - a.total.costNanoUsd ||
    compareSpanishText(a.name ?? a.key, b.name ?? b.key) ||
    compareSpanishText(a.key, b.key)
  );
}

export function aiCostByPeriod(
  calls: readonly RecordedAiCall[],
  groupBy: AiCostGrouping,
): AiCostByPeriod {
  const byKey = new Map<string, { name: string | null; calls: RecordedAiCall[] }>();
  for (const call of calls) {
    const { key, name } = groupOf(call, groupBy);
    const group = byKey.get(key) ?? { name, calls: [] };
    group.calls.push(call);
    byKey.set(key, group);
  }
  const groups = [...byKey.entries()].map(([key, group]) => ({
    key,
    name: group.name,
    ...aiCostOf(group.calls),
  }));
  return {
    groups:
      groupBy === "day"
        ? groups.sort((a, b) => compareSpanishText(a.key, b.key))
        : groups.sort(costliestFirst),
    total: aiCostOf(calls),
  };
}
