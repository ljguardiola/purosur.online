import type { OrderSuggestion } from "@purosur/contracts";
import {
  dataColumn,
  formatNumber,
  formatPricePerSaleUnit,
  formatSaleUnitQuantity,
  plural,
  SearchField,
  Select,
  sortedItems,
  Table,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { deepEqual } from "@tanstack/react-router";
import { ClipboardList, Search, SearchX } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import { chosenSupplierId, LEFT_OUT } from "./order-suggestion-choice";
import type { OrderSuggestionFilters } from "./order-suggestion-filters";
import type { OrderSuggestionScreenServices } from "./order-suggestion-services";
import { useOrderSuggestionQuery, useSuppliersQuery } from "./purchasing-queries";

export type OrderSuggestionScreenProps = {
  filters: OrderSuggestionFilters;
  onFiltersChange: (filters: OrderSuggestionFilters) => void;
  onSessionEnded: () => void;
  services: OrderSuggestionScreenServices;
};

type SuggestedLine = OrderSuggestion["lines"][number];
type Offer = SuggestedLine["offers"][number];
type UnpricedOffer = SuggestedLine["unpricedOffers"][number];
type SupplierOption = { value: string; label: string; status?: string };

const NO_LINES: SuggestedLine[] = [];
const NO_SUPPLIERS: SupplierOption[] = [];

const UNPRICED_REASONS: Record<UnpricedOffer["reason"], string> = {
  vat_rate_missing: "Falta el IVA del ítem",
  link_outdated: "Hay que volver a vincularlo",
};

const LEAVE_OUT_OPTION: SupplierOption = { value: LEFT_OUT, label: "Dejar fuera del pedido" };

const supplierNameOrder = textOrder((option: SupplierOption) => option.label);

function offerOption(offer: Offer, line: SuggestedLine): SupplierOption {
  return {
    value: offer.supplier.id,
    label: `${offer.supplier.name} · ${formatPricePerSaleUnit(offer.pricePerSaleUnit, line.saleUnit)} · ${formatDisplayDate(offer.listDate)}`,
    ...(offer.cheapest ? { status: "El más barato" } : {}),
  };
}

export function OrderSuggestionScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: OrderSuggestionScreenProps) {
  const data = useOrderSuggestionQuery({
    fetchOrderSuggestion: services.fetchOrderSuggestion,
    onSessionEnded,
  });
  const lines = data.status === "loaded" ? data.value.lines : NO_LINES;
  const suppliers = useSuppliersQuery({
    fetchSuppliers: services.fetchSuppliers,
    enabled: lines.some((line) => line.offers.length === 0),
    onSessionEnded,
  });
  const [search, setSearch] = useState(filters.search);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: OrderSuggestionFilters = { search };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, filters]);

  const activeSuppliers =
    suppliers.status === "loaded"
      ? sortedItems(
          suppliers.value
            .filter((supplier) => supplier.active)
            .map((supplier) => ({ value: supplier.id, label: supplier.name })),
          { order: supplierNameOrder, direction: "ascending" },
        )
      : NO_SUPPLIERS;
  const knownSupplierIds = new Set(activeSuppliers.map((supplier) => supplier.value));

  const columns = [
    dataColumn({
      id: "product",
      header: "Producto",
      render: (line: SuggestedLine) => (
        <div className="flex flex-col">
          <span>{formatProductDescription(line)}</span>
          <span className="text-detail text-text-subtle">{line.categoryName}</span>
        </div>
      ),
    }),
    dataColumn({
      id: "sold",
      header: "Vendido (30 días)",
      align: "end",
      render: (line: SuggestedLine) => formatSaleUnitQuantity(line.soldQuantity, line.saleUnit),
    }),
    dataColumn({
      id: "stock",
      header: "Stock",
      align: "end",
      render: (line: SuggestedLine) => formatSaleUnitQuantity(line.stock, line.saleUnit),
    }),
    dataColumn({
      id: "coverage",
      header: "Cobertura",
      align: "end",
      render: (line: SuggestedLine) =>
        `${formatNumber(line.coverageDays)} ${plural(line.coverageDays, { one: "día", other: "días" })}`,
    }),
    dataColumn({
      id: "supplier",
      header: "Proveedor",
      width: 320,
      render: (line: SuggestedLine) => {
        const chosen = chosenSupplierId(line, drafts[line.id], knownSupplierIds);
        const hasPrice = line.offers.length > 0;
        return (
          <div className="flex flex-col gap-1">
            <Select
              name={`supplier-${line.id}`}
              label={`Proveedor de ${formatProductDescription(line)}`}
              labelVisuallyHidden
              placeholder="Elegir proveedor"
              options={[
                ...(hasPrice
                  ? line.offers.map((offer) => offerOption(offer, line))
                  : activeSuppliers),
                LEAVE_OUT_OPTION,
              ]}
              value={chosen}
              onChange={(value) => setDrafts((current) => ({ ...current, [line.id]: value }))}
            />
            {hasPrice ? null : (
              <span className="text-detail text-text-subtle">
                Sin precio en ninguna lista cargada
              </span>
            )}
            {line.unpricedOffers.map((offer) => (
              <p key={offer.supplier.id} className="flex flex-wrap gap-x-2 text-detail">
                <span>{offer.supplier.name}</span>
                <span className="text-warning-strong">{UNPRICED_REASONS[offer.reason]}</span>
              </p>
            ))}
          </div>
        );
      },
    }),
    dataColumn({
      id: "packages",
      header: "Paquetes",
      align: "end",
      render: (line: SuggestedLine) => {
        const offer = chosenOffer(line);
        return offer === undefined
          ? null
          : `${formatNumber(offer.packages)} × ${formatSaleUnitQuantity(offer.packageQuantity, offer.saleUnit)}`;
      },
    }),
    dataColumn({
      id: "quantity",
      header: "Cantidad",
      align: "end",
      render: (line: SuggestedLine) => {
        if (chosenSupplierId(line, drafts[line.id], knownSupplierIds) === LEFT_OUT) {
          return <span className="text-text-subtle">Fuera del pedido</span>;
        }
        return formatSaleUnitQuantity(
          chosenOffer(line)?.quantity ?? line.neededQuantity,
          line.saleUnit,
        );
      },
    }),
    dataColumn({
      id: "perSaleUnit",
      header: "Precio por unidad",
      align: "end",
      render: (line: SuggestedLine) => {
        const offer = chosenOffer(line);
        return offer === undefined ? null : (
          <span className="font-bold">
            {formatPricePerSaleUnit(offer.pricePerSaleUnit, line.saleUnit)}
          </span>
        );
      },
    }),
    dataColumn({
      id: "listDate",
      header: "Fecha de lista",
      render: (line: SuggestedLine) => {
        const offer = chosenOffer(line);
        return offer === undefined ? null : formatDisplayDate(offer.listDate);
      },
    }),
  ] as const;

  function chosenOffer(line: SuggestedLine): Offer | undefined {
    const chosen = chosenSupplierId(line, drafts[line.id], knownSupplierIds);
    return line.offers.find((offer) => offer.supplier.id === chosen);
  }

  const table = useTableModel({
    items: lines,
    id: (line) => line.id,
    search: { text: search, in: (line) => [formatProductDescription(line)] },
    columns,
  });
  const productCount = table.getRowModel().rows.length;

  return (
    <ScreenLayout
      topBar={<AreaTopBar eyebrow="Pedidos" title="Sugerencia de pedido" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="w-105">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar un producto"
          icon={<Search />}
        />
      </div>
      <Table
        aria-label="Sugerencia de pedido"
        table={table}
        {...cloudTableState(data, "la sugerencia de pedido")}
        empty={
          lines.length === 0
            ? {
                icon: <ClipboardList />,
                title: "Ningún producto necesita pedirse",
                variant: "blank",
              }
            : { icon: <SearchX />, title: "Sin resultados", variant: "filtered" }
        }
        footer={
          productCount === 0 ? undefined : (
            <p className="text-text-subtle text-detail">
              {`${formatNumber(productCount)} ${plural(productCount, { one: "producto", other: "productos" })}`}
            </p>
          )
        }
      />
    </ScreenLayout>
  );
}
