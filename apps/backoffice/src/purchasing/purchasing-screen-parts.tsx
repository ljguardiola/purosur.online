import { formatCents } from "@purosur/ui";

export function ExpectedTotalAmount({
  cents,
  hasUnpricedLine,
}: {
  cents: number;
  hasUnpricedLine: boolean;
}) {
  return (
    <div className="flex flex-col items-end">
      <span>{formatCents(cents)}</span>
      {hasUnpricedLine ? (
        <span className="text-detail text-text-subtle">Hay líneas sin precio de lista</span>
      ) : null}
    </div>
  );
}
