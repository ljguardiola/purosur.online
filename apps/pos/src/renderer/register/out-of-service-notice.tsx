import { HighlightedNotice } from "@purosur/ui";
import { Ban } from "lucide-react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";

export function OutOfServiceNotice() {
  return (
    <BrandPanelScreen>
      <div className="w-full max-w-112">
        <HighlightedNotice
          tone="error"
          icon={<Ban />}
          title="La caja necesita restaurarse"
          description="La base de datos de esta caja está dañada y no puede vender. Hay que restaurarla para volver a vender."
        />
      </div>
    </BrandPanelScreen>
  );
}
