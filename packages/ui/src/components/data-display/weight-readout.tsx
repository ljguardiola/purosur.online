import { Eyebrow } from "../layout/eyebrow";

export type WeightReadoutProps = {
  weightLabel: string;
  weight: string;
  amountLabel: string;
  amount: string;
  settled: boolean;
};

function Figure({ label, value, settled }: { label: string; value: string; settled: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg bg-surface px-5 py-4">
      <Eyebrow text={label} tone="warning" />
      <p className={`text-display ${settled ? "text-text" : "opacity-disabled-strong text-text"}`}>
        {value}
      </p>
    </div>
  );
}

export function WeightReadout({
  weightLabel,
  weight,
  amountLabel,
  amount,
  settled,
}: WeightReadoutProps) {
  return (
    <div className="flex gap-4">
      <Figure label={weightLabel} value={weight} settled={settled} />
      <Figure label={amountLabel} value={amount} settled={settled} />
    </div>
  );
}
