import { FigureStat, Keycap } from "@purosur/ui";

export type ReturnPanelFigureProps = {
  label: string;
  value: string | undefined;
};

export function ReturnPanelFigure({ label, value }: ReturnPanelFigureProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-6">
      {value === undefined ? (
        <FigureStat label={label} size="hero" variant="plain" loading />
      ) : (
        <FigureStat label={label} size="hero" variant="plain" value={value} />
      )}
      <Keycap keyName="Escape" />
    </div>
  );
}
