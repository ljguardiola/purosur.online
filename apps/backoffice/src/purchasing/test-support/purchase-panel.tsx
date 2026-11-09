import type { PurchaseSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { vi } from "vitest";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { PurchasePanel, type PurchasePanelProps } from "../purchase-panel";
import type { PurchasePanelServices } from "../purchase-panel-services";
import { compraDeMiel, purchaseChoicesFrom } from "./purchases";

export function createPanelServices(
  overrides: Partial<PurchasePanelServices> = {},
): PurchasePanelServices {
  return {
    fetchPurchaseChoices: vi.fn().mockResolvedValue({ kind: "ok", value: purchaseChoicesFrom([]) }),
    correctPurchaseLineExpiry: vi.fn(),
    splitPurchaseLineExpiry: vi.fn(),
    correctPurchaseLineCost: vi.fn(),
    correctPurchaseLineQuantity: vi.fn(),
    changePurchaseLineProduct: vi.fn(),
    removePurchaseLine: vi.fn(),
    ...overrides,
  };
}

export type PanelOptions = {
  purchase?: PurchaseSummary;
  access?: BackofficeAccess;
  onClose?: PurchasePanelProps["onClose"];
  onCorrected?: PurchasePanelProps["onCorrected"];
  onCorrectionStarted?: PurchasePanelProps["onCorrectionStarted"];
  onStale?: PurchasePanelProps["onStale"];
  onSessionEnded?: PurchasePanelProps["onSessionEnded"];
};

export function renderPanel(
  services: PurchasePanelServices,
  {
    purchase = compraDeMiel,
    access = ADMINISTRATOR_ACCESS,
    onClose = () => {},
    onCorrected = () => {},
    onCorrectionStarted = () => {},
    onStale = () => {},
    onSessionEnded = () => {},
  }: PanelOptions = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchasePanel
          purchase={purchase}
          access={access}
          services={services}
          onClose={onClose}
          onCorrected={onCorrected}
          onCorrectionStarted={onCorrectionStarted}
          onStale={onStale}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

export type Panel = Awaited<ReturnType<typeof renderPanel>>;
