import { formatUsd } from "@purosur/ui";
import { incompleteAiCostText } from "./ai-cost-text";

export function AiCostAmount({ cost }: { cost: { costNanoUsd: number; unpricedCalls: number } }) {
  const incomplete = incompleteAiCostText(cost);
  return (
    <span className="flex flex-col items-end">
      <span>{formatUsd(cost.costNanoUsd)}</span>
      {incomplete === undefined ? null : (
        <span className="text-detail text-text-subtle">{incomplete}</span>
      )}
    </span>
  );
}
