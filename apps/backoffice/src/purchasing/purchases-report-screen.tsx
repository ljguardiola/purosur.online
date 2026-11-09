import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import {
  PURCHASES_REPORT_TITLE,
  PurchasesReportContent,
  type PurchasesReportContentProps,
} from "./purchases-report-content";

export type PurchasesReportScreenProps = PurchasesReportContentProps;

export function PurchasesReportScreen(props: PurchasesReportScreenProps) {
  return (
    <ScreenLayout
      topBar={<AreaTopBar eyebrow="Reportes · Compras" title={PURCHASES_REPORT_TITLE} />}
      bodyClassName="gap-4 p-6"
    >
      <PurchasesReportContent {...props} />
    </ScreenLayout>
  );
}
