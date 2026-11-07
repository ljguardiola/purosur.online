import { AreaTopBar } from "../shell/area-top-bar";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import type { HandConfirmedPaymentsFilters } from "./hand-confirmed-payments-filters";
import { HandConfirmedPaymentsSection } from "./hand-confirmed-payments-section";
import type { HandConfirmedPaymentsScreenServices } from "./hand-confirmed-payments-services";

export type HandConfirmedPaymentsScreenProps = {
  filters: HandConfirmedPaymentsFilters;
  onFiltersChange: (filters: HandConfirmedPaymentsFilters) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: HandConfirmedPaymentsScreenServices;
};

export function HandConfirmedPaymentsScreen(props: HandConfirmedPaymentsScreenProps) {
  return (
    <ScreenLayout
      topBar={<AreaTopBar eyebrow="Reportes · Caja" title="Pagos confirmados a mano" />}
      bodyClassName="gap-4 p-6"
    >
      <HandConfirmedPaymentsSection {...props} />
    </ScreenLayout>
  );
}
