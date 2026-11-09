import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import {
  PRICES_PAST_REVIEW_DEADLINE_REPORT_TITLE,
  PricesPastReviewDeadlineReportContent,
  type PricesPastReviewDeadlineReportContentProps,
} from "./prices-past-review-deadline-report-content";

export type PricesPastReviewDeadlineReportScreenProps = PricesPastReviewDeadlineReportContentProps;

export function PricesPastReviewDeadlineReportScreen(
  props: PricesPastReviewDeadlineReportScreenProps,
) {
  return (
    <ScreenLayout
      topBar={
        <AreaTopBar eyebrow="Reportes · Precios" title={PRICES_PAST_REVIEW_DEADLINE_REPORT_TITLE} />
      }
      bodyClassName="gap-4 p-6"
    >
      <PricesPastReviewDeadlineReportContent {...props} />
    </ScreenLayout>
  );
}
