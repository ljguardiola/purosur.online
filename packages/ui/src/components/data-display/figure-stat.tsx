import { Eyebrow } from "../layout/eyebrow";

export type FigureStatProps = {
  label: string;
  value: string;
  detail?: string | undefined;
};

export function FigureStat({ label, value, detail }: FigureStatProps) {
  return (
    <div className="flex flex-col gap-1">
      <Eyebrow text={label} />
      {detail === undefined ? null : <p className="text-detail text-text-subtle">{detail}</p>}
      <p className="text-display text-text-accent">{value}</p>
    </div>
  );
}
