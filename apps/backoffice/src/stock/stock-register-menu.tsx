import type { StockCountResult, StockMovementResult, StockProduct } from "@purosur/contracts";
import { FloatingNotification, MenuButton, type RowMenuActions } from "@purosur/ui";
import { ArrowDownUp, Check, ClipboardCheck, ClipboardList, PackageX } from "lucide-react";
import { useRef, useState } from "react";
import type { ProductCreationModal } from "../platform/creation-parts";
import {
  type BackofficeAccess,
  canManageProductsAndCategories,
  canPerformStockCounts,
  canRecordInitialInventory,
  canSeeStockBalances,
} from "../shell/backoffice-access";
import { countMomentNow } from "./count-moment";
import { NewCountModal } from "./new-count-modal";
import { ReviewInitialInventoryModal } from "./review-initial-inventory-modal";
import type { ReviewInitialInventoryModalServices } from "./review-initial-inventory-modal-services";
import type { StockBalancesScreenServices } from "./stock-balances-services";
import type { MovementKind } from "./stock-movement-form";
import { StockMovementModal } from "./stock-movement-modal";
import { useRefreshStock } from "./stock-queries";
import { countRegisteredNotice, movementRegisteredNotice } from "./stock-registered-notices";

export type StockRegisterMenuProps = {
  access: BackofficeAccess;
  productCreationModal: ProductCreationModal;
  services: StockBalancesScreenServices;
  initialInventoryServices: ReviewInitialInventoryModalServices;
  initialInventoryOpen: boolean;
  onInitialInventoryOpenChange: (open: boolean) => void;
  onSessionEnded: () => void;
  now?: () => Date;
};

type Registering =
  | { kind: "count"; start: ReturnType<typeof countMomentNow> }
  | { kind: "movement"; movement: MovementKind };

type ScreenNotice = { id: number; title: string; description: string };

const MOVEMENT_TITLES = { adjustment: "Cargar ajuste", loss: "Cargar pérdida" } as const;

export function StockRegisterMenu({
  access,
  productCreationModal,
  services,
  initialInventoryServices,
  initialInventoryOpen,
  onInitialInventoryOpenChange,
  onSessionEnded,
  now,
}: StockRegisterMenuProps) {
  const clock = now ?? (() => new Date());
  const [registering, setRegistering] = useState<Registering | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);
  const refreshStock = useRefreshStock();
  const showsBalance = canSeeStockBalances(access);
  const mayRecordInitialInventory = canRecordInitialInventory(access);

  function startRegistering(next: Registering) {
    setNotice(null);
    setRegistering(next);
  }

  const entries: RowMenuActions[number][] = [];
  if (canPerformStockCounts(access)) {
    entries.push({
      label: "Recuento",
      icon: <ClipboardCheck />,
      onAction: () => startRegistering({ kind: "count", start: countMomentNow(clock()) }),
    });
  }
  if (access.stockMovementKinds.includes("adjustment")) {
    entries.push({
      label: "Ajuste",
      icon: <ArrowDownUp />,
      onAction: () => startRegistering({ kind: "movement", movement: "adjustment" }),
    });
  }
  if (access.stockMovementKinds.includes("loss")) {
    entries.push({
      label: "Pérdida",
      icon: <PackageX />,
      onAction: () => startRegistering({ kind: "movement", movement: "loss" }),
    });
  }
  if (mayRecordInitialInventory) {
    entries.push({
      label: "Inventario inicial",
      icon: <ClipboardList />,
      onAction: () => {
        setNotice(null);
        onInitialInventoryOpenChange(true);
      },
    });
  }
  const [first, ...others] = entries;

  function showNotice(shown: Omit<ScreenNotice, "id">) {
    lastNoticeId.current += 1;
    setNotice({ ...shown, id: lastNoticeId.current });
  }

  function handleCountRegistered(product: StockProduct, result: StockCountResult) {
    setRegistering(null);
    void refreshStock();
    showNotice(countRegisteredNotice(product, result, showsBalance));
  }

  function handleMovementRegistered(
    product: StockProduct,
    result: StockMovementResult,
    delta: number,
  ) {
    setRegistering(null);
    void refreshStock();
    showNotice(movementRegisteredNotice(product, result, delta, showsBalance));
  }

  const creation = canManageProductsAndCategories(access) ? { productCreationModal } : {};

  return (
    <>
      {first === undefined ? null : <MenuButton label="Registrar" actions={[first, ...others]} />}
      {registering?.kind === "count" ? (
        <NewCountModal
          startMoment={registering.start}
          showsBalance={showsBalance}
          {...creation}
          services={services}
          onClose={() => setRegistering(null)}
          onSessionEnded={onSessionEnded}
          onRegistered={handleCountRegistered}
        />
      ) : null}
      {registering?.kind === "movement" ? (
        <StockMovementModal
          title={MOVEMENT_TITLES[registering.movement]}
          kinds={[registering.movement]}
          showsBalance={showsBalance}
          {...creation}
          services={services}
          onClose={() => setRegistering(null)}
          onSessionEnded={onSessionEnded}
          onRegistered={handleMovementRegistered}
        />
      ) : null}
      {initialInventoryOpen && mayRecordInitialInventory ? (
        <ReviewInitialInventoryModal
          services={initialInventoryServices}
          onClose={() => onInitialInventoryOpenChange(false)}
          onSessionEnded={onSessionEnded}
        />
      ) : null}
      {notice ? (
        <FloatingNotification
          key={notice.id}
          tone="success"
          icon={<Check />}
          title={notice.title}
          description={notice.description}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
    </>
  );
}
