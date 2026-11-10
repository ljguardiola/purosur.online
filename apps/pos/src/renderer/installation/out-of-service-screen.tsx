import { InlineNotice, ScreenHeader } from "@purosur/ui";
import { Ban } from "lucide-react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";

export function OutOfServiceScreen({ version }: { version: string | null }) {
  return (
    <BrandPanelScreen version={version}>
      <main className="flex w-full max-w-110 flex-col gap-4">
        <ScreenHeader title="La caja necesita restaurarse" />
        <InlineNotice
          tone="error"
          icon={<Ban />}
          title="Su base de datos está dañada"
          description="No puede vender."
        />
      </main>
    </BrandPanelScreen>
  );
}
