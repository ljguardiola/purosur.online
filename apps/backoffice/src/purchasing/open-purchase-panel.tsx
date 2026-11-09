import type { PurchaseSummary } from "@purosur/contracts";
import { useEffect, useEffectEvent } from "react";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { PurchasePanel, type PurchasePanelProps } from "./purchase-panel";

export type OpenPurchasePanelProps = {
  purchases: readonly PurchaseSummary[];
  purchasesAreLoaded: boolean;
  openPurchase: string | undefined;
  access: BackofficeAccess;
  services: PurchasePanelProps["services"];
  onClose: () => void;
  onCorrected: PurchasePanelProps["onCorrected"];
  onCorrectionStarted: () => void;
  onStale: () => void;
  onSessionEnded: () => void;
};

export function OpenPurchasePanel({
  purchases,
  purchasesAreLoaded,
  openPurchase,
  onClose,
  ...panel
}: OpenPurchasePanelProps) {
  const purchase = purchases.find((candidate) => candidate.id === openPurchase);
  const closeUnlisted = useEffectEvent(onClose);
  useEffect(() => {
    if (purchasesAreLoaded && openPurchase !== undefined && purchase === undefined) {
      closeUnlisted();
    }
  }, [purchasesAreLoaded, openPurchase, purchase]);

  if (purchase === undefined) {
    return null;
  }
  return <PurchasePanel key={purchase.id} purchase={purchase} onClose={onClose} {...panel} />;
}
