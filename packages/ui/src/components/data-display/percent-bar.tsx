import { formatPercent } from "../../messages/formatters";
import { ProportionBar, paintedFraction } from "./proportion-bar";

export type PercentBarProps = {
  value: number;
};

export function PercentBar({ value }: PercentBarProps) {
  return (
    <div className="flex items-center gap-3">
      <ProportionBar value={value} />
      <span className="text-detail text-text-subtle">
        {formatPercent(Math.round(paintedFraction(value) * 100))}
      </span>
    </div>
  );
}
