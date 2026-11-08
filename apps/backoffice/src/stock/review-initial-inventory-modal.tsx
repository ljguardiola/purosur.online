import {
  actionsColumn,
  Button,
  dataColumn,
  FloatingNotification,
  formatCalendarDayNumeric,
  formatNumber,
  ListFilter,
  Modal,
  plural,
  SearchField,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { Check, ClipboardList, Pencil, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatStockQuantity } from "../platform/stock-quantity";
import { EditLotCostModal, type InitialInventoryLot } from "./edit-lot-cost-modal";
import type { ReviewInitialInventoryModalServices } from "./review-initial-inventory-modal-services";
import { formatStockUnitCost, formatStockValue } from "./stock-cost";
import { useInitialInventoryLotsQuery, useRefreshStock } from "./stock-queries";

export type ReviewInitialInventoryModalProps = {
  onClose: () => void;
  onSessionEnded: () => void;
  services: ReviewInitialInventoryModalServices;
};

type CostFilter = "all" | "known" | "incomplete";

type ScreenNotice = { id: number; title: string; description: string };

const NO_LOTS: InitialInventoryLot[] = [];

const SEARCH_DEBOUNCE_MS = 300;

const COST_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "incomplete", label: "Sin costo" },
  { value: "known", label: "Con costo" },
] as const;

const columns = [
  dataColumn({
    id: "product",
    header: "Producto",
    render: (lot: InitialInventoryLot) => (
      <TableCellText strong description={lot.categoryName}>
        {formatProductDescription({
          name: lot.productName,
          brandName: lot.brandName,
          netContent: lot.netContent,
        })}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "expiresOn",
    header: "Vence",
    render: (lot: InitialInventoryLot) =>
      lot.expiresOn === null ? (
        <TableCellText tone="subtle">—</TableCellText>
      ) : (
        <TableCellText>{formatCalendarDayNumeric(lot.expiresOn)}</TableCellText>
      ),
  }),
  dataColumn({
    id: "counted",
    header: "Contado",
    align: "end",
    render: (lot: InitialInventoryLot) => (
      <TableCellText
        strong
        description={
          lot.withdrawn
            ? `Línea retirada · en stock: ${formatStockQuantity(lot.remaining, lot.saleUnit)}`
            : undefined
        }
      >
        {formatStockQuantity(lot.counted, lot.saleUnit)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "unitCost",
    header: "Costo de referencia",
    align: "end",
    render: (lot: InitialInventoryLot) => (
      <TableCellText strong={lot.unitCostCents === null} tone={costTone(lot)}>
        {formatStockUnitCost(lot.unitCostCents, lot.saleUnit)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "value",
    header: "Valorizado",
    align: "end",
    render: (lot: InitialInventoryLot) => (
      <TableCellText strong={lot.valueCents !== null}>
        {formatStockValue(lot.valueCents)}
      </TableCellText>
    ),
  }),
] as const;

function costTone(lot: InitialInventoryLot) {
  return lot.unitCostCents === null ? "error" : undefined;
}

function footerText(lots: readonly InitialInventoryLot[]): string {
  const withoutCost = lots.filter((lot) => lot.unitCostCents === null).length;
  const counted = plural(lots.length, {
    one: "1 lote de la puesta en marcha",
    other: `${formatNumber(lots.length)} lotes de la puesta en marcha`,
  });
  return withoutCost === 0 ? counted : `${counted} · ${formatNumber(withoutCost)} sin costo`;
}

export function ReviewInitialInventoryModal({
  onClose,
  onSessionEnded,
  services,
}: ReviewInitialInventoryModalProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cost, setCost] = useState<CostFilter>("all");
  const [editTarget, setEditTarget] = useState<InitialInventoryLot | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);
  const refreshStock = useRefreshStock();

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  const data = useInitialInventoryLotsQuery({
    filters: {
      ...(cost === "all" ? {} : { cost }),
      ...(debouncedSearch === "" ? {} : { product: debouncedSearch }),
    },
    fetchInitialInventoryLots: services.fetchInitialInventoryLots,
    onSessionEnded,
  });
  const lots = data.status === "loaded" ? data.value.lots : NO_LOTS;

  const rowActions = actionsColumn({
    id: "actions",
    header: "Acciones",
    actions: [
      (lot: InitialInventoryLot) => ({
        icon: <Pencil />,
        "aria-label": `Editar el costo de ${formatProductDescription({ name: lot.productName, brandName: lot.brandName, netContent: lot.netContent })}`,
        onPress: () => {
          setNotice(null);
          setEditTarget(lot);
        },
      }),
    ],
  });

  const table = useTableModel({
    items: lots,
    id: (lot) => lot.lotId,
    columns: [...columns, rowActions],
  });
  const shownLots = table.getRowModel().rows.map((row) => row.original);

  function handleSaved(lot: InitialInventoryLot) {
    setEditTarget(null);
    void refreshStock();
    lastNoticeId.current += 1;
    setNotice({
      id: lastNoticeId.current,
      title: "Costo guardado",
      description: `${formatProductDescription({ name: lot.productName, brandName: lot.brandName, netContent: lot.netContent })}.`,
    });
  }

  return (
    <>
      <Modal
        open
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="editor"
        tone="info"
        icon={<ClipboardList />}
        context="Stock"
        title="Inventario inicial"
        footer={
          <Button variant="secondary" size="large" onPress={onClose}>
            Listo
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-105">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar un producto"
              icon={<Search />}
            />
          </div>
          <ListFilter
            name="cost"
            label="Lotes:"
            options={COST_OPTIONS}
            value={cost}
            onChange={setCost}
          />
        </div>
        <Table
          aria-label="Inventario inicial"
          table={table}
          {...cloudTableState(data, "los lotes")}
          empty={
            lots.length === 0 && cost === "all" && debouncedSearch === ""
              ? {
                  icon: <ClipboardList />,
                  title: "Todavía no se contó el local",
                  description: "Los lotes aparecen cuando la caja carga el inventario inicial.",
                  variant: "blank",
                }
              : {
                  icon: <Search />,
                  title: "Sin resultados",
                  description: "Probá con otro nombre o costo.",
                  variant: "filtered",
                }
          }
          footer={
            shownLots.length === 0 ? undefined : (
              <p className="text-text-subtle text-detail">{footerText(shownLots)}</p>
            )
          }
        />
      </Modal>
      {editTarget ? (
        <EditLotCostModal
          lot={editTarget}
          services={services}
          onClose={() => setEditTarget(null)}
          onSessionEnded={onSessionEnded}
          onSaved={handleSaved}
          onOutdated={() => void refreshStock()}
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
