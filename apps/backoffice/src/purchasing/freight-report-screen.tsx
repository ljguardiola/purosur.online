import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import {
  FREIGHT_REPORT_TITLE,
  FreightReportContent,
  type FreightReportContentProps,
} from "./freight-report-content";

export type FreightReportScreenProps = FreightReportContentProps;

export function FreightReportScreen(props: FreightReportScreenProps) {
  return (
    <ScreenLayout
      topBar={<AreaTopBar eyebrow="Reportes · Compras" title={FREIGHT_REPORT_TITLE} />}
      bodyClassName="gap-4 p-6"
    >
      <FreightReportContent {...props} />
    </ScreenLayout>
  );
}
