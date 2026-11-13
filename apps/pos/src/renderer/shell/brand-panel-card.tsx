import type { CardPanelProps } from "@purosur/ui";
import { CardPanel } from "@purosur/ui";

export function BrandPanelCard(props: CardPanelProps) {
  return (
    <main className="max-w-full">
      <CardPanel {...props} />
    </main>
  );
}
