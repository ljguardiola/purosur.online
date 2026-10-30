import type { AiCostByPeriodBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatUsd,
  ListFilter,
  Table,
  useTableModel,
} from "@purosur/ui";
import { Bot } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { ReportFilters } from "../shell/report-filters";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { AiCostAmount } from "./ai-cost-amount";
import type { AiCostReportFilters } from "./ai-cost-report-filters";
import type { AiCostReportScreenServices } from "./ai-cost-report-services";
import { incompleteAiCostText } from "./ai-cost-text";
import { useAiCostReportQuery } from "./purchasing-queries";

export type AiCostReportScreenProps = {
  filters: AiCostReportFilters;
  onFiltersChange: (filters: AiCostReportFilters) => void;
  onSessionEnded: () => void;
  services: AiCostReportScreenServices;
};

type Grouping = AiCostReportFilters["group"];
type CostGroup = AiCostByPeriodBody["groups"][number];

const NO_GROUPS: CostGroup[] = [];

const GROUPING_OPTIONS = [
  { value: "day" as const, label: "Día" },
  { value: "supplier" as const, label: "Proveedor" },
  { value: "person" as const, label: "Persona" },
] as const;

function groupLabel(grouping: Grouping, group: CostGroup): string {
  if (grouping === "day") {
    return formatDisplayDate(group.key);
  }
  return group.name ?? group.key;
}

function costColumns(grouping: Grouping) {
  return [
    dataColumn({
      id: "group",
      header: GROUPING_OPTIONS.find((option) => option.value === grouping)?.label ?? "",
      render: (group: CostGroup) => groupLabel(grouping, group),
    }),
    dataColumn({
      id: "reading",
      header: "Lectura",
      align: "end",
      render: (group: CostGroup) => <AiCostAmount cost={group.reading} />,
    }),
    dataColumn({
      id: "proposals",
      header: "Propuestas",
      align: "end",
      render: (group: CostGroup) => <AiCostAmount cost={group.proposals} />,
    }),
    dataColumn({
      id: "total",
      header: "Total",
      align: "end",
      render: (group: CostGroup) => <AiCostAmount cost={group.total} />,
    }),
  ] as const;
}

export function AiCostReportScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: AiCostReportScreenProps) {
  const data = useAiCostReportQuery({
    query: {
      ...(filters.from === "" ? {} : { from: filters.from, to: filters.to }),
      group_by: filters.group,
    },
    fetchAiCostReport: services.fetchAiCostReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.groups ?? NO_GROUPS,
    id: (group) => group.key,
    columns: costColumns(filters.group),
  });
  const cards = [
    { label: "Costo de lectura", total: shown?.total.reading },
    { label: "Costo de propuestas", total: shown?.total.proposals },
    { label: "Costo total", total: shown?.total.total },
  ];

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Compras" title="Costo de IA por período" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          answeredPeriod={shown?.range}
        />
        <ListFilter
          name="group"
          label="Agrupar por:"
          options={GROUPING_OPTIONS}
          value={filters.group}
          onChange={(group) => onFiltersChange({ ...filters, group })}
        />
      </div>
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
          {cards.map(({ label, total }) => {
            if (total === undefined) {
              return (
                <Card key={label}>
                  <FigureStat size="heading" label={label} loading />
                </Card>
              );
            }
            const detail = incompleteAiCostText(total);
            return (
              <Card key={label}>
                <FigureStat
                  size="heading"
                  label={label}
                  value={formatUsd(total.costNanoUsd)}
                  {...(detail === undefined ? {} : { detail })}
                />
              </Card>
            );
          })}
        </div>
      )}
      <Table
        aria-label="Costo de IA por período"
        table={table}
        {...cloudTableState(data, "el costo de IA por período")}
        empty={{
          icon: <Bot />,
          title: "No hay costo de IA en este período",
          variant: filters.from === "" ? "blank" : "filtered",
        }}
      />
    </ScreenLayout>
  );
}
