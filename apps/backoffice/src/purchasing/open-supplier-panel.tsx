import type { SupplierSummary } from "@purosur/contracts";
import { useEffect, useEffectEvent } from "react";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { SupplierPanel } from "./supplier-panel";

export type OpenSupplierPanelProps = {
  suppliers: readonly SupplierSummary[];
  suppliersAreLoaded: boolean;
  openSupplier: string | undefined;
  tab: string | undefined;
  access: BackofficeAccess;
  onClose: () => void;
  onEdit: (supplier: SupplierSummary) => void;
  onDeactivate: (supplier: SupplierSummary) => void;
  onReactivate: (supplier: SupplierSummary) => void;
};

export function OpenSupplierPanel({
  suppliers,
  suppliersAreLoaded,
  openSupplier,
  tab,
  access,
  onClose,
  onEdit,
  onDeactivate,
  onReactivate,
}: OpenSupplierPanelProps) {
  const supplier = suppliers.find((candidate) => candidate.id === openSupplier);
  const closeUnlisted = useEffectEvent(onClose);
  useEffect(() => {
    if (suppliersAreLoaded && openSupplier !== undefined && supplier === undefined) {
      closeUnlisted();
    }
  }, [suppliersAreLoaded, openSupplier, supplier]);

  if (supplier === undefined) {
    return null;
  }
  return (
    <SupplierPanel
      key={supplier.id}
      supplier={supplier}
      access={access}
      tab={tab}
      onClose={onClose}
      onEdit={() => onEdit(supplier)}
      onDeactivate={() => onDeactivate(supplier)}
      onReactivate={() => onReactivate(supplier)}
    />
  );
}
