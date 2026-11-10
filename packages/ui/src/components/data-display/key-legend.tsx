import { Keycap, type KeyName } from "./keycap";

export type KeyLegendItem = { keyName: KeyName; label: string };

export type KeyLegendProps = { items: readonly KeyLegendItem[] };

export function KeyLegend({ items }: KeyLegendProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map(({ keyName, label }) => (
        <li key={keyName} className="flex items-center gap-2 text-detail text-text-subtle">
          <Keycap keyName={keyName} />
          {label}
        </li>
      ))}
    </ul>
  );
}
