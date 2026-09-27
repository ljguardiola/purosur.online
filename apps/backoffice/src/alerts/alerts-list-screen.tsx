import { ALERT_KINDS } from "@purosur/contracts";
import {
  Button,
  InlineNotice,
  ListFilter,
  Pagination,
  plural,
  SearchField,
  StatusIndicator,
  type StatusIndicatorTone,
  Table,
  TableCellText,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Bell, Eye, Search, ShieldX, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BackofficeAccess } from "../access/backoffice-access";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useLatestRef } from "../platform/use-latest-ref";
import { ScreenLayout } from "../shell/screen-layout";
import {
  ALERT_LEVEL_LABELS,
  AlertDetailModal,
  type AlertDetailModalServices,
  alertDateTime,
} from "./alert-detail-modal";
import {
  type AlertKind,
  type AlertLevel,
  type AlertListPage,
  type AlertSummary,
  fetchAlerts as fetchAlertsDefault,
} from "./alerts-api";
import type { AlertsListFilters } from "./routes";

const LIST_KIND_LABELS = {
  backoffice_passkey_changed: "Passkey",
  backoffice_recovery_requested: "Recuperación de acceso",
  user_email_changed: "Correo",
  backoffice_sign_in_lockout: "Bloqueo de ingreso",
} satisfies Record<AlertKind, string>;

const LIST_KIND_DESCRIPTIONS = {
  backoffice_passkey_changed: "Se registró o dio de baja una passkey",
  backoffice_recovery_requested: "Se pidió el enlace de acceso",
  user_email_changed: "Se cambió una dirección de correo",
  backoffice_sign_in_lockout: "Demasiados intentos fallidos de ingreso",
} satisfies Record<AlertKind, string>;

export type AlertsListScreenServices = {
  fetchAlerts: typeof fetchAlertsDefault;
  alertDetailModal?: AlertDetailModalServices;
};

export const defaultAlertsListScreenServices: AlertsListScreenServices = {
  fetchAlerts: fetchAlertsDefault,
};

export type AlertsListScreenProps = {
  filters: AlertsListFilters;
  onFiltersChange: (filters: AlertsListFilters) => void;
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services?: AlertsListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; page: AlertListPage };

// Every search is a request against the backoffice's own hourly rate limit, so one is sent only
// once typing pauses, not per keystroke.
const SEARCH_DELAY_MS = 300;

type LevelFilter = "all" | AlertLevel;
type StatusFilter = "open" | "closed";

const LEVEL_TONE: Record<AlertLevel, StatusIndicatorTone> = {
  critical: "error",
  warning: "warning",
  informational: "info",
};

function levelLabel(level: AlertLevel): string {
  return ALERT_LEVEL_LABELS[level];
}

function listKindLabel(kind: string): string {
  return kind in LIST_KIND_LABELS ? LIST_KIND_LABELS[kind as keyof typeof LIST_KIND_LABELS] : kind;
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
    `${listKindLabel(kind)} ${listKindDescription(kind)}`.toLowerCase().includes(query),
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
  const sendToMyAccount = useSendToMyAccount();
  const { fetchAlerts, alertDetailModal } = services ?? defaultAlertsListScreenServices;
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [levelFilter, setLevelFilter] = useState<LevelFilter>(filters.level);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(filters.status);
  const [search, setSearch] = useState(filters.search);
  const [searchQuery, setSearchQuery] = useState(filters.search.trim());
  const [page, setPage] = useState(filters.page);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  const requestRef = useRef(0);
  const onSessionEndedRef = useLatestRef(onSessionEnded);
  const onFiltersChangeRef = useLatestRef(onFiltersChange);

  useEffect(() => {
    const shown: AlertsListFilters = { level: levelFilter, status: statusFilter, search, page };
    if (!deepEqual(shown, filters)) {
      onFiltersChangeRef.current(shown);
    }
  }, [levelFilter, statusFilter, search, page, filters, onFiltersChangeRef]);

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

  const load = useCallback(async () => {
    requestRef.current += 1;
    const request = requestRef.current;
    setList({ kind: "loading" });
    const outcome = await fetchAlerts({
      ...(levelFilter === "all" ? {} : { level: levelFilter }),
      open: statusFilter === "open",
      page,
      ...(searchQuery ? { search: { text: searchQuery, kinds: kindsMatching(searchQuery) } } : {}),
    });
    if (request !== requestRef.current) {
      return;
    }
    if (outcome.kind === "ok") {
      // Closing the last alerts of the last page (here or elsewhere) can leave this page past the
      // end: move to the last page that still has alerts, which reloads, instead of showing it.
      const lastPage = Math.max(1, Math.ceil(outcome.value.total / outcome.value.pageSize));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setList({ kind: "loaded", page: outcome.value });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
    } else if (outcome.kind === "rate_limited") {
      setList({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      setList({ kind: "loadError" });
    }
  }, [
    fetchAlerts,
    levelFilter,
    statusFilter,
    page,
    searchQuery,
    onSessionEndedRef,
    sendToMyAccount,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const alerts = list.kind === "loaded" ? list.page.alerts : [];
  const openCount = list.kind === "loaded" ? list.page.openCount : 0;
  const criticalCount = list.kind === "loaded" ? list.page.openCriticalCount : 0;
  const pageCount = list.kind === "loaded" ? Math.ceil(list.page.total / list.page.pageSize) : 0;
  const isFiltered = searchQuery.length > 0 || levelFilter !== "all" || statusFilter !== "open";

  const columns = [
    {
      key: "level",
      title: "Nivel",
      render: (item: AlertSummary) => (
        <StatusIndicator tone={LEVEL_TONE[item.level]}>{levelLabel(item.level)}</StatusIndicator>
      ),
    },
    {
      key: "alert",
      title: "Alerta",
      render: (item: AlertSummary) => (
        <TableCellText detail={listKindDescription(item.kind)}>
          {listKindLabel(item.kind)}
        </TableCellText>
      ),
    },
    {
      key: "scope",
      title: "Alcance",
      render: (item: AlertSummary) => item.scopeDisplay ?? "—",
    },
    {
      key: "openedAt",
      title: "Abierta",
      render: (item: AlertSummary) => alertDateTime(new Date(item.openedAt)),
    },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Acciones de la alerta",
      actions: [
        (item: AlertSummary) => ({
          icon: <Eye />,
          "aria-label": `Ver la alerta «${listKindLabel(item.kind)}»`,
          onPress: () => setSelectedAlertId(item.id),
        }),
      ],
    },
  ] as const;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
            <div className="flex flex-col justify-center">
              <p className="text-ink-secondary text-sm">Inicio</p>
              <h1 className="font-bold text-2xl text-brand-blue-strong">Alertas</h1>
            </div>
            {openCount > 0 && (
              <div className="inline-flex h-[1.75rem] items-center gap-2 rounded-[0.875rem] bg-status-warning-message-bg px-3 font-sans text-sm font-semibold text-status-warning-strong">
                <Bell aria-hidden="true" className="size-3.5 shrink-0" />
                {plural(openCount, {
                  one: "1 alerta abierta",
                  other: `${openCount} alertas abiertas`,
                })}
              </div>
            )}
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {list.kind === "loadError" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No pudimos abrir las alertas"
              detail="Probá de nuevo en unos minutos."
            />
            <Button variant="secondary" onPress={() => void load()}>
              Reintentar
            </Button>
          </>
        )}
        {list.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              detail={retryAfterDetail(list.retryAfterSeconds)}
            />
            <Button variant="secondary" onPress={() => void load()}>
              Reintentar
            </Button>
          </>
        )}
        {(list.kind === "loading" || list.kind === "loaded") && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-[26.25rem]">
                <SearchField
                  variant="backoffice"
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
              loading={list.kind === "loading" ? "initial" : false}
              rows={alerts.map((alert) => ({ id: alert.id, item: alert }))}
              empty={
                isFiltered
                  ? {
                      icon: <Search />,
                      title: "No encontramos alertas",
                      detail: "Probá cambiar la búsqueda o los filtros.",
                      tone: "filtered",
                    }
                  : {
                      icon: <Bell />,
                      title: "Sin alertas abiertas",
                      detail: "Cuando algo necesite atención, aparece acá.",
                      tone: "blank",
                    }
              }
              footer={
                <div className="flex items-center justify-between gap-4">
                  <p className="text-ink-secondary text-sm">
                    {`${plural(openCount, { one: "1 alerta abierta", other: `${openCount} alertas abiertas` })} · ${plural(criticalCount, { one: "1 crítica", other: `${criticalCount} críticas` })}`}
                  </p>
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    onPageChange={setPage}
                    label="Páginas de alertas"
                  />
                </div>
              }
            />
          </>
        )}
      </ScreenLayout>
      <AlertDetailModal
        alertId={selectedAlertId}
        access={access}
        onClose={() => setSelectedAlertId(null)}
        onClosed={() => {
          setSelectedAlertId(null);
          void load();
        }}
        onSessionEnded={onSessionEnded}
        {...(alertDetailModal ? { services: alertDetailModal } : {})}
      />
    </>
  );
}
