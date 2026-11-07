import { Button, FloatingNotification } from "@purosur/ui";
import { Check, QrCode } from "lucide-react";
import { useRef, useState } from "react";
import {
  type BackofficeAccess,
  canSeeContingencyTicketRescue,
  canSeeFiscalConfigurationArea,
  canSeeFiscalInformation,
} from "../shell/backoffice-access";
import { CaeaFortnightReports } from "./caea-fortnight-reports";
import { CaeaPointsOfSale } from "./caea-points-of-sale";
import { CaeaSection } from "./caea-section";
import type { CaeaScreenServices } from "./caea-services";
import type { ExceptionalityFilters } from "./exceptionality-filters";
import { ExceptionalitySection } from "./exceptionality-section";
import { POINTS_OF_SALE_ANCHOR } from "./fiscal-tabs";

export type CaeaScreenProps = {
  access: BackofficeAccess;
  filters: ExceptionalityFilters;
  onFiltersChange: (filters: ExceptionalityFilters) => void;
  onRescue: () => void;
  onSessionEnded: () => void;
  services: CaeaScreenServices;
};

type ScreenNotice = { id: number; title: string; description: string };

export function CaeaScreen({
  access,
  filters,
  onFiltersChange,
  onRescue,
  onSessionEnded,
  services,
}: CaeaScreenProps) {
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);

  function announce(title: string, description: string) {
    lastNoticeId.current += 1;
    setNotice({ id: lastNoticeId.current, title, description });
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 p-6">
      {canSeeContingencyTicketRescue(access) ? (
        <div>
          <Button variant="secondary" icon={<QrCode />} onPress={onRescue}>
            Rescatar tickets de contingencia
          </Button>
        </div>
      ) : null}
      {canSeeFiscalInformation(access) ? (
        <CaeaSection anchor="exceptionality" title="Excepcionalidad">
          <ExceptionalitySection
            filters={filters}
            onFiltersChange={onFiltersChange}
            onSessionEnded={onSessionEnded}
            services={services}
          />
        </CaeaSection>
      ) : null}
      {canSeeFiscalConfigurationArea(access) ? (
        <>
          <CaeaSection anchor="fortnight-reports" title="Informes quincenales">
            <CaeaFortnightReports
              onAnnounce={announce}
              onSessionEnded={onSessionEnded}
              services={services}
            />
          </CaeaSection>
          <CaeaSection anchor={POINTS_OF_SALE_ANCHOR} title="Puntos de venta">
            <CaeaPointsOfSale
              onAnnounce={announce}
              onSessionEnded={onSessionEnded}
              services={services}
            />
          </CaeaSection>
        </>
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
    </div>
  );
}
