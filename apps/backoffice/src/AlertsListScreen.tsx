import {
  Button,
  InlineNotice,
  ListFilter,
  Pagination,
  SearchField,
  StatusIndicator,
  type StatusIndicatorTone,
  Table,
  TableCellText,
} from "@purosur/ui";
import { Bell, Eye, Search, ShieldX, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertDetailModal, type AlertDetailModalServices } from "./AlertDetailModal";
import type { BackofficeAccess } from "./access";
import {
  type AlertLevel,
  type AlertListPage,
  type AlertSummary,
  fetchAlerts as fetchAlertsDefault,
} from "./alertsApi";
import { messages } from "./messages";
import { ScreenLayout } from "./ScreenLayout";
import { sendToMyAccount } from "./settingsRoutes";

export type AlertsListScreenServices = {
  fetchAlerts: typeof fetchAlertsDefault;
  alertDetailModal?: AlertDetailModalServices;
};

export const defaultAlertsListScreenServices: AlertsListScreenServices = {
  fetchAlerts: fetchAlertsDefault,
};

export type AlertsListScreenProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API. */
  services?: AlertsListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  // The page's open counts ignore the level/status filters and search: the header pill and footer
  // summarize every open alert, not just the rows shown.
  | { kind: "loaded"; page: AlertListPage };

// Every search is a request against the backoffice's own hourly rate limit, so one is sent only
// once typing pauses, not per keystroke.
const SEARCH_DELAY_MS = 300;

type LevelFilter = "all" | AlertLevel;
type StatusFilter = "open" | "closed";

const alertsMessages = messages.inicio.alerts;

const LEVEL_TONE: Record<AlertLevel, StatusIndicatorTone> = {
  critical: "error",
  warning: "warning",
  informational: "info",
};

function levelLabel(level: AlertLevel): string {
  return alertsMessages.levelOptions[level];
}

function listKindLabel(kind: string): string {
  return kind in alertsMessages.listKindLabels
    ? alertsMessages.listKindLabels[kind as keyof typeof alertsMessages.listKindLabels]
    : kind;
}

function listKindDescription(kind: string): string {
  return kind in alertsMessages.listKindDescriptions
    ? alertsMessages.listKindDescriptions[kind as keyof typeof alertsMessages.listKindDescriptions]
    : "";
}

const LIST_KINDS = Object.keys(alertsMessages.listKindLabels);

function kindsMatching(text: string): string[] {
  const query = text.toLowerCase();
  return LIST_KINDS.filter((kind) =>
    `${listKindLabel(kind)} ${listKindDescription(kind)}`.toLowerCase().includes(query),
  );
}

const LEVEL_FILTER_OPTIONS = [
  { value: "all", label: alertsMessages.levelAllOption },
  { value: "critical", label: alertsMessages.levelOptions.critical },
  { value: "warning", label: alertsMessages.levelOptions.warning },
  { value: "informational", label: alertsMessages.levelOptions.informational },
] as const;

const STATUS_FILTER_OPTIONS = [
  { value: "open", label: alertsMessages.statusOpenOption },
  { value: "closed", label: alertsMessages.statusClosedOption },
] as const;

/**
 * "Alertas": every alert the viewer's own permission admits (`canSeeAlertsArea`), filtered by
 * level and open/closed status, searched and paged server-side, with a detail modal (never its
 * own route, the same pattern `RoleEditorModal` uses over Roles) for the eye action.
 */
export function AlertsListScreen({ access, onSessionEnded, services }: AlertsListScreenProps) {
  const { fetchAlerts, alertDetailModal } = services ?? defaultAlertsListScreenServices;
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  // Bumped on every request, so a response to one sent before the filters, search or page
  // changed knows it no longer belongs here.
  const requestRef = useRef(0);
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

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
  }, [fetchAlerts, levelFilter, statusFilter, page, searchQuery]);

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
      title: alertsMessages.columns.level,
      render: (item: AlertSummary) => (
        <StatusIndicator tone={LEVEL_TONE[item.level]}>{levelLabel(item.level)}</StatusIndicator>
      ),
    },
    {
      key: "alert",
      title: alertsMessages.columns.alert,
      render: (item: AlertSummary) => (
        <TableCellText detail={listKindDescription(item.kind)}>
          {listKindLabel(item.kind)}
        </TableCellText>
      ),
    },
    {
      key: "scope",
      title: alertsMessages.columns.scope,
      render: (item: AlertSummary) => item.scopeDisplay ?? alertsMessages.scopeNone,
    },
    {
      key: "openedAt",
      title: alertsMessages.columns.openedAt,
      render: (item: AlertSummary) => alertsMessages.dateTime({ date: new Date(item.openedAt) }),
    },
    {
      key: "actions",
      kind: "actions",
      srLabel: alertsMessages.rowActionsLabel,
      actions: [
        (item: AlertSummary) => ({
          icon: <Eye />,
          "aria-label": alertsMessages.viewAria({ title: listKindLabel(item.kind) }),
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
              <p className="text-ink-secondary text-sm">{alertsMessages.breadcrumb}</p>
              <h1 className="font-bold text-2xl text-brand-blue-strong">
                {alertsMessages.heading}
              </h1>
            </div>
            {openCount > 0 && (
              <div className="inline-flex h-[1.75rem] items-center gap-2 rounded-[0.875rem] bg-status-warning-message-bg px-3 font-sans text-sm font-semibold text-status-warning-strong">
                <Bell aria-hidden="true" className="size-3.5 shrink-0" />
                {alertsMessages.openPill({ count: openCount })}
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
              title={alertsMessages.loadErrorTitle}
              detail={alertsMessages.loadErrorDetail}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {alertsMessages.retry}
            </Button>
          </>
        )}
        {list.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={alertsMessages.rateLimitedTitle}
              detail={alertsMessages.rateLimitedDetail({
                minutes: Math.ceil(list.retryAfterSeconds / 60),
              })}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {alertsMessages.retry}
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
                  placeholder={alertsMessages.searchPlaceholder}
                  icon={<Search />}
                />
              </div>
              <ListFilter
                label={alertsMessages.levelFilterLabel}
                options={LEVEL_FILTER_OPTIONS}
                value={levelFilter}
                onChange={(value) => {
                  setLevelFilter(value);
                  setPage(1);
                }}
              />
              <ListFilter
                label={alertsMessages.statusFilterLabel}
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              />
            </div>
            <Table
              aria-label={alertsMessages.heading}
              columns={columns}
              loading={list.kind === "loading" ? "initial" : false}
              rows={alerts.map((alert) => ({ id: alert.id, item: alert }))}
              empty={
                isFiltered
                  ? {
                      icon: <Search />,
                      title: alertsMessages.noResultsTitle,
                      detail: alertsMessages.noResultsDetail,
                      tone: "filtered",
                    }
                  : {
                      icon: <Bell />,
                      title: alertsMessages.emptyTitle,
                      detail: alertsMessages.emptyDetail,
                      tone: "blank",
                    }
              }
              footer={
                <div className="flex items-center justify-between gap-4">
                  <p className="text-ink-secondary text-sm">
                    {alertsMessages.footer({ count: openCount, criticalCount })}
                  </p>
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    onPageChange={setPage}
                    previousLabel={alertsMessages.pagination.previous}
                    nextLabel={alertsMessages.pagination.next}
                    label={alertsMessages.pagination.label}
                    pageLabel={(pageNumber) => alertsMessages.pagination.page({ page: pageNumber })}
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
