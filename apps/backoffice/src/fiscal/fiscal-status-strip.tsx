import { Card, FigureStat, formatCalendarDayRange, formatNumber, LoadFailure } from "@purosur/ui";
import type { ReactElement } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { mapCloudData } from "../platform/map-cloud-data";
import { type PagePart, pagePartsFor } from "../platform/page-parts";
import type { CloudData } from "../platform/use-cloud-query";
import {
  type BackofficeAccess,
  canSeeFiscalConfigurationArea,
  canSeeFiscalInformation,
} from "../shell/backoffice-access";
import {
  useCurrentOfflineAuthorizationCodeQuery,
  useFortnightPresentationsQuery,
  usePendingFiscalTasksCount,
  useUnbilledDeferredSalesQuery,
} from "./fiscal-queries";
import type { FiscalStatusStripServices } from "./fiscal-status-strip-services";

type FigureKey = "pending-tasks" | "unbilled-sales" | "current-caea" | "pending-reports";

const FIGURES: readonly PagePart<BackofficeAccess, FigureKey>[] = [
  { key: "pending-tasks", isVisibleTo: canSeeFiscalInformation },
  { key: "unbilled-sales", isVisibleTo: canSeeFiscalInformation },
  { key: "current-caea", isVisibleTo: canSeeFiscalInformation },
  { key: "pending-reports", isVisibleTo: canSeeFiscalConfigurationArea },
];

type Figure = { value: string; detail?: string };

type FigureProps = {
  services: FiscalStatusStripServices;
  onSessionEnded: () => void;
};

function FigureCard({
  label,
  subject,
  data,
}: {
  label: string;
  subject: string;
  data: CloudData<Figure>;
}) {
  return (
    <Card>
      {data.status === "failed" ? (
        <LoadFailure {...cloudLoadFailure(data, subject)} />
      ) : data.status === "loading" ? (
        <FigureStat size="heading" label={label} loading />
      ) : (
        <FigureStat
          size="heading"
          label={label}
          value={data.value.value}
          {...(data.value.detail === undefined ? {} : { detail: data.value.detail })}
        />
      )}
    </Card>
  );
}

function PendingTasksFigure({ services, onSessionEnded }: FigureProps) {
  const count = usePendingFiscalTasksCount({
    enabled: true,
    fetchFiscalTasks: services.fetchFiscalTasks,
    onSessionEnded,
  });
  return (
    <FigureCard
      label="Tareas fiscales pendientes"
      subject="las tareas fiscales pendientes"
      data={mapCloudData(count, (tasks) => ({ value: formatNumber(tasks) }))}
    />
  );
}

function UnbilledSalesFigure({ services, onSessionEnded }: FigureProps) {
  const sales = useUnbilledDeferredSalesQuery({
    fetchUnbilledDeferredSales: services.fetchUnbilledDeferredSales,
    onSessionEnded,
  });
  return (
    <FigureCard
      label="Ventas diferidas sin facturar"
      subject="las ventas diferidas sin facturar"
      data={mapCloudData(sales, ({ count }) => ({ value: formatNumber(count) }))}
    />
  );
}

function CurrentCaeaFigure({ services, onSessionEnded }: FigureProps) {
  const read = useCurrentOfflineAuthorizationCodeQuery({
    fetchCurrentOfflineAuthorizationCode: services.fetchCurrentOfflineAuthorizationCode,
    onSessionEnded,
  });
  return (
    <FigureCard
      label="CAEA vigente"
      subject="el CAEA vigente"
      data={mapCloudData(read, ({ offline_authorization_code: stored }) =>
        stored === null
          ? { value: "Sin CAEA" }
          : {
              value: stored.code,
              detail: `Quincena ${formatCalendarDayRange(stored.fortnight_start, stored.fortnight_end)}`,
            },
      )}
    />
  );
}

function PendingReportsFigure({ services, onSessionEnded }: FigureProps) {
  const presentations = useFortnightPresentationsQuery({
    fetchFortnightPresentations: services.fetchFortnightPresentations,
    onSessionEnded,
  });
  return (
    <FigureCard
      label="Informes quincenales pendientes"
      subject="los informes quincenales pendientes"
      data={mapCloudData(presentations, (items) => ({
        value: formatNumber(items.filter(({ owed }) => owed).length),
      }))}
    />
  );
}

const FIGURE_COMPONENTS = {
  "pending-tasks": PendingTasksFigure,
  "unbilled-sales": UnbilledSalesFigure,
  "current-caea": CurrentCaeaFigure,
  "pending-reports": PendingReportsFigure,
} as const satisfies Record<FigureKey, (props: FigureProps) => ReactElement>;

export function FiscalStatusStrip({
  access,
  onSessionEnded,
  services,
}: FigureProps & { access: BackofficeAccess }) {
  const parts = pagePartsFor(access, FIGURES);
  if (parts.kind === "hidden") {
    return null;
  }
  return (
    <div className="grid shrink-0 grid-cols-4 gap-4 px-6 pt-6">
      {parts.visible.map((key) => {
        const Figure = FIGURE_COMPONENTS[key];
        return <Figure key={key} services={services} onSessionEnded={onSessionEnded} />;
      })}
    </div>
  );
}
