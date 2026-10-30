import { formatNumber, plural } from "@purosur/ui";

export function incompleteAiCostText(cost: {
  costNanoUsd: number;
  unpricedCalls: number;
}): string | undefined {
  if (cost.unpricedCalls === 0) {
    return undefined;
  }
  const calls = plural(cost.unpricedCalls, {
    one: "llamada sin precio",
    other: "llamadas sin precio",
  });
  return `Incompleto: ${formatNumber(cost.unpricedCalls)} ${calls}`;
}
