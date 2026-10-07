import { ButtonLink, Card } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { ScreenLayout } from "../shell/screen-layout";
import { SalesTopBar } from "./sales-screen-parts";

const ReportLink = createLink(ButtonLink);

export function ReportsIndexScreen() {
  return (
    <ScreenLayout topBar={<SalesTopBar eyebrow="Puro Sur" title="Reportes" />} bodyClassName="p-6">
      <ul className="flex flex-col gap-4">
        <li>
          <Card>
            <ReportLink to="/reports/sales-by-day" variant="text">
              Ventas por día o por rango
            </ReportLink>
            <p className="text-detail text-text-subtle">
              Las ventas de cada día, de una caja o de todas.
            </p>
          </Card>
        </li>
      </ul>
    </ScreenLayout>
  );
}
