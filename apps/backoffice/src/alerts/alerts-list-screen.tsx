import type { AlertListPage, AlertSummary } from "@purosur/contracts";
import { ALERT_KINDS, type AlertKind, type AlertLevel } from "@purosur/domain";
import {
  ListFilter,
  Pagination,
  plural,
  SearchField,
  StatusIndicator,
  Table,
  TableCellText,
  tableRows,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Bell, Eye, Search } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import type { BackofficeAccess } from "../access/backoffice-access";
import { cloudTableState } from "../platform/cloud-table-state";
import type { CloudData } from "../platform/use-cloud-query";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { ALERT_LEVEL_LABELS, AlertDetailModal, alertDateTime } from "./alert-detail-modal";
import { alertKindLabel } from "./alert-kind-label";
import { ALERT_LEVEL_TONE } from "./alert-level-tone";
import type { AlertListQuery } from "./alerts-api";
import type { AlertsListScreenServices } from "./alerts-list-services";
import { AlertsOpenCountPill } from "./alerts-open-count-pill";
import { useAlertsQuery } from "./alerts-queries";
import type { AlertsListFilters } from "./routes";

const LIST_KIND_DESCRIPTIONS = {
  backoffice_passkey_changed: "Se registró o dio de baja una passkey",
  backoffice_recovery_requested: "Se pidió el enlace de acceso",
  user_email_changed: "Se cambió una dirección de correo",
  backoffice_sign_in_lockout: "Demasiados intentos fallidos de ingreso",
  user_access_increased: "Se amplió el acceso de un usuario",
  register_enrolled: "Se dio de alta una caja",
} satisfies Record<AlertKind, string>;

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

function listKindDescription(kind: string): string {
  return kind in LIST_KIND_DESCRIPTIONS
    ? LIST_KIND_DESCRIPTIONS[kind as keyof typeof LIST_KIND_DESCRIPTIONS]
    : "";
}

const LIST_KINDS: readonly string[] = ALERT_KINDS;

function kindsMatching(text: string): string[] {
  const query = text.toLowerCase();
  return LIST_KINDS.filter((kind) =>
    `${alertKindLabel(kind)} ${listKindDescription(kind)}`.toLowerCase().includes(query),
  );
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
    {
      key: "level",
      header: "Nivel",
      render: (item: AlertSummary) => (
        <StatusIndicator tone={ALERT_LEVEL_TONE[item.level]}>
          {levelLabel(item.level)}
        </StatusIndicator>
      ),
    },
    {
      key: "alert",
      header: "Alerta",
      render: (item: AlertSummary) => (
        <TableCellText description={listKindDescription(item.kind)}>
          {alertKindLabel(item.kind)}
        </TableCellText>
      ),
    },
    {
      key: "scope",
      header: "Alcance",
      render: (item: AlertSummary) => item.scopeDisplay ?? "—",
    },
    {
      key: "openedAt",
      header: "Abierta",
      render: (item: AlertSummary) => alertDateTime(new Date(item.openedAt)),
    },
    {
      key: "actions",
      kind: "actions",
      header: "Acciones de la alerta",
      actions: [
        (item: AlertSummary) => ({
          icon: <Eye />,
          "aria-label": `Ver la alerta «${alertKindLabel(item.kind)}»`,
          onPress: () => setSelectedAlertId(item.id),
        }),
      ],
    },
  ] as const;

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
            label="Nivel"
            options={LEVEL_FILTER_OPTIONS}
            value={levelFilter}
            onChange={(value) => {
              setLevelFilter(value);
              setPage(1);
            }}
          />
          <ListFilter
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
          columns={columns}
          {...cloudTableState(data, "las alertas")}
          rows={tableRows({ items: alerts, id: (alert) => alert.id }).rows}
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
