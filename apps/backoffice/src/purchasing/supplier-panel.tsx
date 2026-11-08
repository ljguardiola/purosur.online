import type { SupplierSummary } from "@purosur/contracts";
import { DetailPanel, Tab, Tabs } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { landingPart, pagePartsFor } from "../platform/page-parts";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { SupplierData } from "./supplier-data";
import { SupplierFreightsTab } from "./supplier-freights-tab";
import { SupplierListsTab } from "./supplier-lists-tab";
import { SupplierOrdersTab } from "./supplier-orders-tab";
import { SUPPLIER_PANEL_TABS, type SupplierPanelTab } from "./supplier-panel-tabs";
import { SupplierPurchasesTab } from "./supplier-purchases-tab";

const SupplierPanelTabLink = createLink(Tab);

const TAB_LABELS: Record<SupplierPanelTab, string> = {
  data: "Datos",
  lists: "Listas",
  orders: "Pedidos",
  purchases: "Compras",
  freights: "Fletes",
};

export type SupplierPanelProps = {
  supplier: SupplierSummary;
  access: BackofficeAccess;
  tab: string | undefined;
  onClose: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
};

export function SupplierPanel({
  supplier,
  access,
  tab,
  onClose,
  onEdit,
  onDeactivate,
  onReactivate,
}: SupplierPanelProps) {
  const parts = pagePartsFor(access, SUPPLIER_PANEL_TABS);
  const visible = parts.kind === "shown" ? parts.visible : [];
  const selectedTab = parts.kind === "shown" ? landingPart(parts, tab) : undefined;
  return (
    <DetailPanel open onClose={onClose} recordKey={supplier.id} title={supplier.name}>
      {selectedTab === undefined ? null : (
        <Tabs
          label="Secciones del proveedor"
          selectedTab={selectedTab}
          tabs={visible.map((key) => (
            <SupplierPanelTabLink
              key={key}
              to="."
              search={(previous) => ({ ...previous, tab: key })}
              value={key}
              label={TAB_LABELS[key]}
            />
          ))}
        >
          <div className="pt-4">
            {selectedTab === "data" && (
              <SupplierData
                supplier={supplier}
                onEdit={onEdit}
                onDeactivate={onDeactivate}
                onReactivate={onReactivate}
              />
            )}
            {selectedTab === "lists" && <SupplierListsTab supplierId={supplier.id} />}
            {selectedTab === "orders" && <SupplierOrdersTab supplierId={supplier.id} />}
            {selectedTab === "purchases" && <SupplierPurchasesTab supplierId={supplier.id} />}
            {selectedTab === "freights" && <SupplierFreightsTab supplierId={supplier.id} />}
          </div>
        </Tabs>
      )}
    </DetailPanel>
  );
}
