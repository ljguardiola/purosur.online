import {
  InlineNotice,
  ListFilter,
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
import { type AlertLevel, type AlertSummary, fetchAlerts as fetchAlertsDefault } from "./alertsApi";
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
  // `openAlerts` is fetched separately (always `open=true`, ignoring the level/status filters
  // below): the header pill and footer summarize every open alert, not just the filtered rows.
  | { kind: "loaded"; alerts: AlertSummary[]; openAlerts: AlertSummary[] };

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

function searchText(alert: AlertSummary): string {
  return `${listKindLabel(alert.kind)} ${listKindDescription(alert.kind)} ${alert.scopeDisplay}`.toLowerCase();
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
 * level and open/closed status server-side, searched client-side, with a detail modal (never its
 * own route, the same pattern `RoleEditorModal` uses over Roles) for the eye action.
 */
export function AlertsListScreen({ access, onSessionEnded, services }: AlertsListScreenProps) {
  const { fetchAlerts, alertDetailModal } = services ?? defaultAlertsListScreenServices;
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [search, setSearch] = useState("");
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  const load = useCallback(async () => {
    setList({ kind: "loading" });
    const [filteredOutcome, openOutcome] = await Promise.all([
      fetchAlerts({
        ...(levelFilter === "all" ? {} : { level: levelFilter }),
        open: statusFilter === "open",
      }),
      fetchAlerts({ open: true }),
    ]);
    const outcomes = [filteredOutcome, openOutcome];
    if (outcomes.some((outcome) => outcome.kind === "unauthenticated")) {
      onSessionEndedRef.current();
      return;
    }
    const rateLimited = outcomes.flatMap((outcome) =>
      outcome.kind === "rate_limited" ? [outcome.retryAfterSeconds] : [],
    );
    if (rateLimited.length > 0) {
      setList({ kind: "rate_limited", retryAfterSeconds: Math.max(...rateLimited) });
    } else if (outcomes.some((outcome) => outcome.kind === "forbidden")) {
      sendToMyAccount();
    } else if (filteredOutcome.kind === "ok" && openOutcome.kind === "ok") {
      setList({ kind: "loaded", alerts: filteredOutcome.value, openAlerts: openOutcome.value });
    } else {
      setList({ kind: "loadError" });
    }
  }, [fetchAlerts, levelFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const alerts = list.kind === "loaded" ? list.alerts : [];
  const openAlerts = list.kind === "loaded" ? list.openAlerts : [];
  const openCount = openAlerts.length;
  const criticalCount = openAlerts.filter((alert) => alert.level === "critical").length;
  const query = search.trim().toLowerCase();
  const filtered = query ? alerts.filter((alert) => searchText(alert).includes(query)) : alerts;
  const isFiltered = query.length > 0 || levelFilter !== "all" || statusFilter !== "open";

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
      render: (item: AlertSummary) => item.scopeDisplay,
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
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={alertsMessages.loadErrorTitle}
            detail={alertsMessages.loadErrorDetail}
          />
        )}
        {list.kind === "rate_limited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={alertsMessages.rateLimitedTitle}
            detail={alertsMessages.rateLimitedDetail({
              minutes: Math.ceil(list.retryAfterSeconds / 60),
            })}
          />
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
                onChange={setLevelFilter}
              />
              <ListFilter
                label={alertsMessages.statusFilterLabel}
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
            <Table
              aria-label={alertsMessages.heading}
              columns={columns}
              loading={list.kind === "loading" ? "initial" : false}
              rows={filtered.map((alert) => ({ id: alert.id, item: alert }))}
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
                <p className="text-ink-secondary text-sm">
                  {alertsMessages.footer({ count: openCount, criticalCount })}
                </p>
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
