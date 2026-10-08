import type { AlertListPage, AlertSummary } from "@purosur/contracts";
import type { AlertLevel } from "@purosur/domain";
import {
  actionsColumn,
  dataColumn,
  ListFilter,
  Pagination,
  plural,
  SearchField,
  StatusIndicator,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Bell, Eye, Search } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { CloudData } from "../platform/use-cloud-query";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { ALERT_LEVEL_LABELS, AlertDetailModal, alertDateTime } from "./alert-detail-modal";
import { alertKindDescription, DESCRIBED_ALERT_KINDS } from "./alert-kind-description";
import { alertKindLabel } from "./alert-kind-label";
import { ALERT_LEVEL_TONE } from "./alert-level-tone";
import { alertScopeLabel } from "./alert-scope-label";
import type { AlertListQuery } from "./alerts-api";
import type { AlertsListScreenServices } from "./alerts-list-services";
import { AlertsOpenCountPill } from "./alerts-open-count-pill";
import { useAlertsQuery } from "./alerts-queries";
import { localAlertText } from "./local-alert-text";
import type { AlertsListFilters } from "./routes";

export type AlertsListScreenProps = {
  filters: AlertsListFilters;
  onFiltersChange: (filters: AlertsListFilters) => void;
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: AlertsListScreenServices;
};

const NO_ALERTS: AlertSummary[] = [];

// Every search is a request against the backoffice's own hourly rate limit, so one is sent only
// once typing pauses, not per keystroke.
const SEARCH_DELAY_MS = 300;

type LevelFilter = "all" | AlertLevel;
type StatusFilter = "open" | "closed";

function levelLabel(level: AlertLevel): string {
  return ALERT_LEVEL_LABELS[level];
}

function kindsMatching(text: string): string[] {
  const query = text.toLowerCase();
  return DESCRIBED_ALERT_KINDS.filter((kind) =>
    `${alertKindLabel(kind)} ${alertKindDescription(kind)} ${localAlertText(kind)?.title ?? ""}`
      .toLowerCase()
      .includes(query),
  );
}

function localTextOf(alert: AlertSummary) {
  return alert.audience === "local" ? localAlertText(alert.kind) : undefined;
}

function alertRowTitle(alert: AlertSummary): string {
  return localTextOf(alert)?.title ?? alertKindLabel(alert.kind);
}

function alertRowDescription(alert: AlertSummary): string {
  const local = localTextOf(alert);
  return local === undefined
    ? alertKindDescription(alert.kind)
    : `${local.meaning} ${local.whatToDo}`;
}

const LEVEL_FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "critical", label: ALERT_LEVEL_LABELS.critical },
  { value: "warning", label: ALERT_LEVEL_LABELS.warning },
  { value: "informational", label: ALERT_LEVEL_LABELS.informational },
] as const;

const STATUS_FILTER_OPTIONS = [
  { value: "open", label: "Abiertas" },
  { value: "closed", label: "Cerradas" },
] as const;

export function AlertsListScreen({
  filters,
  onFiltersChange,
  access,
  onSessionEnded,
  services,
}: AlertsListScreenProps) {
  const { fetchAlerts, alertDetailModal } = services;
  const [levelFilter, setLevelFilter] = useState<LevelFilter>(filters.level);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(filters.status);
  const [search, setSearch] = useState(filters.search);
  const [searchQuery, setSearchQuery] = useState(filters.search.trim());
  const [page, setPage] = useState(filters.page);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: AlertsListFilters = { level: levelFilter, status: statusFilter, search, page };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [levelFilter, statusFilter, search, page, filters]);

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === searchQuery) {
      return;
    }
    const timer = setTimeout(() => {
      setSearchQuery(trimmed);
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, searchQuery]);

  const listQuery: AlertListQuery = {
    ...(levelFilter === "all" ? {} : { level: levelFilter }),
    open: statusFilter === "open",
    page,
    ...(searchQuery ? { search: { text: searchQuery, kinds: kindsMatching(searchQuery) } } : {}),
  };
  const read = useAlertsQuery({ query: listQuery, fetchAlerts, onSessionEnded });

  const lastPage =
    read.status === "loaded"
      ? Math.max(1, Math.ceil(read.value.total / read.value.pageSize))
      : undefined;
  const isPastLastPage = lastPage !== undefined && page > lastPage;
  const settledLastPage = read.status === "loaded" && !read.refreshing ? lastPage : undefined;
  useEffect(() => {
    // Closing the last alerts of the last page (here or elsewhere) can leave this page past the
    // end: it keeps loading while it moves to the last page that still has alerts, never empty.
    if (settledLastPage !== undefined && page > settledLastPage) {
      setPage(settledLastPage);
    }
  }, [settledLastPage, page]);
  const data: CloudData<AlertListPage> = isPastLastPage ? { status: "loading" } : read;

  const alerts = data.status === "loaded" ? data.value.alerts : NO_ALERTS;
  const openCount = data.status === "loaded" ? data.value.openCount : 0;
  const criticalCount = data.status === "loaded" ? data.value.openCriticalCount : 0;
  const pageCount =
    data.status === "loaded" ? Math.ceil(data.value.total / data.value.pageSize) : 0;
  const isFiltered = searchQuery.length > 0 || levelFilter !== "all" || statusFilter !== "open";

  const columns = [
    dataColumn({
      id: "level",
      header: "Nivel",
      render: (item: AlertSummary) => (
        <StatusIndicator tone={ALERT_LEVEL_TONE[item.level]}>
          {levelLabel(item.level)}
        </StatusIndicator>
      ),
    }),
    dataColumn({
      id: "alert",
      header: "Alerta",
      render: (item: AlertSummary) => (
        <TableCellText description={alertRowDescription(item)}>{alertRowTitle(item)}</TableCellText>
      ),
    }),
    dataColumn({
      id: "scope",
      header: "Alcance",
      render: (item: AlertSummary) =>
        item.scopeDisplay === null ? "—" : alertScopeLabel(item.kind, item.scopeDisplay),
    }),
    dataColumn({
      id: "openedAt",
      header: "Abierta",
      render: (item: AlertSummary) => alertDateTime(new Date(item.openedAt)),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones de la alerta",
      actions: [
        (item: AlertSummary) => ({
          icon: <Eye />,
          "aria-label": `Ver la alerta «${alertRowTitle(item)}»`,
          onPress: () => setSelectedAlertId(item.id),
        }),
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: alerts,
    id: (alert) => alert.id,
    columns,
  });

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Inicio</p>
              <ScreenTitle>Alertas</ScreenTitle>
            </div>
            <AlertsOpenCountPill openCount={openCount} />
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-105">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar una alerta"
              icon={<Search />}
            />
          </div>
          <ListFilter
            name="level"
            label="Nivel"
            options={LEVEL_FILTER_OPTIONS}
            value={levelFilter}
            onChange={(value) => {
              setLevelFilter(value);
              setPage(1);
            }}
          />
          <ListFilter
            name="status"
            label="Estado"
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
          />
        </div>
        <Table
          aria-label="Alertas"
          table={table}
          {...cloudTableState(data, "las alertas")}
          empty={
            isFiltered
              ? {
                  icon: <Search />,
                  title: "No encontramos alertas",
                  description: "Probá cambiar la búsqueda o los filtros.",
                  variant: "filtered",
                }
              : {
                  icon: <Bell />,
                  title: "Sin alertas abiertas",
                  description: "Cuando algo necesite atención, aparece acá.",
                  variant: "blank",
                }
          }
          footer={
            alerts.length === 0 ? undefined : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-text-subtle text-detail">
                  {`${plural(openCount, { one: "1 alerta abierta", other: `${openCount} alertas abiertas` })} · ${plural(criticalCount, { one: "1 crítica", other: `${criticalCount} críticas` })}`}
                </p>
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  onPageChange={setPage}
                  label="Páginas de alertas"
                />
              </div>
            )
          }
        />
      </ScreenLayout>
      <AlertDetailModal
        alertId={selectedAlertId}
        access={access}
        onClose={() => setSelectedAlertId(null)}
        onClosed={() => setSelectedAlertId(null)}
        onSessionEnded={onSessionEnded}
        {...(alertDetailModal ? { services: alertDetailModal } : {})}
      />
    </>
  );
}
