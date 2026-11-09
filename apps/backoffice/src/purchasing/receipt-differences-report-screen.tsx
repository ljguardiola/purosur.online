import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import {
  RECEIPT_DIFFERENCES_REPORT_TITLE,
  ReceiptDifferencesReportContent,
  type ReceiptDifferencesReportContentProps,
} from "./receipt-differences-report-content";

export type ReceiptDifferencesReportScreenProps = ReceiptDifferencesReportContentProps;

export function ReceiptDifferencesReportScreen(props: ReceiptDifferencesReportScreenProps) {
  return (
    <ScreenLayout
      topBar={<AreaTopBar eyebrow="Reportes · Compras" title={RECEIPT_DIFFERENCES_REPORT_TITLE} />}
      bodyClassName="gap-4 p-6"
    >
      <ReceiptDifferencesReportContent {...props} />
    </ScreenLayout>
  );
}
