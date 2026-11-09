import {
  DetailPanel,
  LoadingPlaceholder,
  type LoadingPlaceholderProps,
  Tab,
  Tabs,
} from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { Suspense } from "react";
import { landingPart, type PagePart, pagePartsFor } from "../platform/page-parts";
import type { RegisterPanelSections } from "../platform/register-panel-sections";
import type { RegisterPointOfSaleSection } from "../platform/register-point-of-sale-section";
import {
  type BackofficeAccess,
  canAssignPointTerminal,
  canAssignQrPointOfSale,
  canSeeBackupsArea,
  canSeeFiscalConfigurationArea,
  canSeeRegistersArea,
  canSeeReports,
} from "../shell/backoffice-access";
import type { ReportPeriodFilters } from "../shell/report-filters-search";
import { RegisterDataSection } from "./register-data-section";
import type { RegisterActions } from "./register-row-actions";
import type { RegisterName, RegisterSummary } from "./registers-api";

export type RegisterPanelProps = RegisterPanelBaseProps &
  (
    | { summary: RegisterSummary; actions: RegisterActions; secondsSinceRead: number }
    | { summary?: undefined; actions?: undefined; secondsSinceRead?: undefined }
  );

type RegisterPanelBaseProps = {
  register: RegisterName;
  access: BackofficeAccess;
  registerPointOfSaleSection: RegisterPointOfSaleSection;
  tab?: string | undefined;
  sessionsPeriod: ReportPeriodFilters;
  onSessionsPeriodChange: (period: ReportPeriodFilters) => void;
  onClose: () => void;
  onPointOfSaleSaved: () => void;
  onSessionEnded: () => void;
  registerPanelSections: RegisterPanelSections;
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

function SectionPlaceholder({ shape }: { shape: LoadingPlaceholderProps }) {
  return (
    <div className="pt-4">
      <LoadingPlaceholder {...shape} />
    </div>
  );
}

export function RegisterPanel({
  register,
  summary,
  actions,
  secondsSinceRead,
  access,
  registerPointOfSaleSection: PointOfSaleSection,
  tab,
  sessionsPeriod,
  onSessionsPeriodChange,
  onClose,
  onPointOfSaleSaved,
  onSessionEnded,
  registerPanelSections: {
    payments: PaymentsSection,
    backups: BackupsSection,
    sessions: SessionsSection,
  },
}: RegisterPanelProps) {
  const details = summary === undefined ? undefined : { summary, actions, secondsSinceRead };
  const parts = pagePartsFor(access, REGISTER_PANEL_TABS);
  if (parts.kind === "hidden") {
    return null;
  }
  const selectedTab = landingPart(parts, tab);
  const pointOfSaleSlot = (
    <PointOfSaleSection
      registerId={register.id}
      onSessionEnded={onSessionEnded}
      onSaved={onPointOfSaleSaved}
    />
  );

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
        {selectedTab === "data" && details !== undefined && (
          <RegisterDataSection
            register={details.summary}
            access={access}
            actions={details.actions}
            secondsSinceRead={details.secondsSinceRead}
          />
        )}
        {selectedTab === "fiscal" &&
          (details === undefined ? (
            <div className="flex flex-col gap-4 pt-4">{pointOfSaleSlot}</div>
          ) : (
            <Suspense fallback={<SectionPlaceholder shape={{ variant: "card", lines: 2 }} />}>
              <PaymentsSection
                register={details.summary}
                mayAssignPointTerminal={canAssignPointTerminal(access)}
                mayAssignQrPointOfSale={canAssignQrPointOfSale(access)}
                onAssignPointTerminal={() => details.actions.assignTerminal(details.summary)}
                onAssignQrPointOfSale={() => details.actions.assignQr(details.summary)}
                pointOfSaleSlot={pointOfSaleSlot}
              />
            </Suspense>
          ))}
        {selectedTab === "backups" && (
          <Suspense fallback={<SectionPlaceholder shape={{ variant: "rows", rows: 5 }} />}>
            <BackupsSection register={register} onSessionEnded={onSessionEnded} />
          </Suspense>
        )}
        {selectedTab === "sessions" && (
          <Suspense fallback={<SectionPlaceholder shape={{ variant: "rows", rows: 5 }} />}>
            <SessionsSection
              registerId={register.id}
              period={sessionsPeriod}
              onPeriodChange={onSessionsPeriodChange}
              onSessionEnded={onSessionEnded}
            />
          </Suspense>
        )}
      </Tabs>
    </DetailPanel>
  );
}
