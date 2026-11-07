import { DetailPanel, Tab, Tabs } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { landingPart, type PagePart, pagePartsFor } from "../platform/page-parts";
import type { RegisterPointOfSaleSection } from "../platform/register-point-of-sale-section";
import {
  type BackofficeAccess,
  canSeeBackupsArea,
  canSeeFiscalConfigurationArea,
  canSeeRegistersArea,
  canSeeReports,
} from "../shell/backoffice-access";
import type { ReportPeriodFilters } from "../shell/report-filters-search";
import { RegisterDataSection } from "./register-data-section";
import { RegisterPaymentsSection } from "./register-payments-section";
import type { RegisterActions } from "./register-row-actions";
import { RegisterSessionsSection } from "./register-sessions-section";
import type { RegisterSummary } from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";
import { SnapshotBackupsSection } from "./snapshot-backups-section";

export type RegisterPanelProps = {
  register: RegisterSummary;
  access: BackofficeAccess;
  actions: RegisterActions;
  registerPointOfSaleSection: RegisterPointOfSaleSection;
  secondsSinceRead: number;
  tab?: string | undefined;
  sessionsPeriod: ReportPeriodFilters;
  onSessionsPeriodChange: (period: ReportPeriodFilters) => void;
  onClose: () => void;
  onPointOfSaleSaved: () => void;
  onSessionEnded: () => void;
  services: RegistersListScreenServices;
};

type RegisterPanelTab = "data" | "fiscal" | "backups" | "sessions";

const REGISTER_PANEL_TABS: readonly PagePart<BackofficeAccess, RegisterPanelTab>[] = [
  { key: "data", isVisibleTo: canSeeRegistersArea },
  { key: "fiscal", isVisibleTo: canSeeFiscalConfigurationArea },
  { key: "backups", isVisibleTo: canSeeBackupsArea },
  { key: "sessions", isVisibleTo: canSeeReports },
];

const TAB_LABELS: Record<RegisterPanelTab, string> = {
  data: "Datos",
  fiscal: "Fiscal y cobros",
  backups: "Copias",
  sessions: "Sesiones",
};

const RegisterTabLink = createLink(Tab);

export function RegisterPanel({
  register,
  access,
  actions,
  registerPointOfSaleSection: PointOfSaleSection,
  secondsSinceRead,
  tab,
  sessionsPeriod,
  onSessionsPeriodChange,
  onClose,
  onPointOfSaleSaved,
  onSessionEnded,
  services,
}: RegisterPanelProps) {
  const parts = pagePartsFor(access, REGISTER_PANEL_TABS);
  if (parts.kind === "hidden") {
    return null;
  }
  const selectedTab = landingPart(parts, tab);

  return (
    <DetailPanel open onClose={onClose} recordKey={register.id} title={register.name}>
      <Tabs
        label="Secciones de la caja"
        selectedTab={selectedTab}
        tabs={parts.visible.map((key) => (
          <RegisterTabLink
            key={key}
            from="/registers"
            to="/registers"
            search={(previous) => ({ ...previous, register: register.id, tab: key })}
            value={key}
            label={TAB_LABELS[key]}
          />
        ))}
      >
        {selectedTab === "data" && (
          <RegisterDataSection
            register={register}
            access={access}
            actions={actions}
            secondsSinceRead={secondsSinceRead}
          />
        )}
        {selectedTab === "fiscal" && (
          <RegisterPaymentsSection
            register={register}
            access={access}
            actions={actions}
            pointOfSaleSlot={
              <PointOfSaleSection
                registerId={register.id}
                onSessionEnded={onSessionEnded}
                onSaved={onPointOfSaleSaved}
              />
            }
          />
        )}
        {selectedTab === "backups" && (
          <SnapshotBackupsSection
            register={register}
            onSessionEnded={onSessionEnded}
            services={services}
          />
        )}
        {selectedTab === "sessions" && (
          <RegisterSessionsSection
            registerId={register.id}
            period={sessionsPeriod}
            onPeriodChange={onSessionsPeriodChange}
            onSessionEnded={onSessionEnded}
            services={services}
          />
        )}
      </Tabs>
    </DetailPanel>
  );
}
