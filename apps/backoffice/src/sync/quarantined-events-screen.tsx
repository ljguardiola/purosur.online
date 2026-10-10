import { actionsColumn, dataColumn, FloatingNotification, Table, useTableModel } from "@purosur/ui";
import { Check, LockOpen, PackageX, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import {
  quarantinedDateTimeText,
  quarantinedEventColumnText,
  quarantinedEventSentenceText,
  quarantinedReasonText,
  quarantinedRegisterText,
} from "./quarantined-event-labels";
import type { QuarantinedEvent } from "./quarantined-events-api";
import type { QuarantinedEventsScreenServices } from "./quarantined-events-services";
import { ReleaseQuarantinedEventModal } from "./release-quarantined-event-modal";
import { useQuarantinedEventsQuery, useRefreshSync } from "./sync-queries";

export type QuarantinedEventsScreenProps = {
  onSessionEnded: () => void;
  services: QuarantinedEventsScreenServices;
};

const NO_EVENTS: QuarantinedEvent[] = [];

type ScreenNotice = {
  id: number;
  tone: "success" | "error";
  title: string;
  description: string;
};

function columnsFor(openRelease: (event: QuarantinedEvent) => void) {
  return [
    dataColumn({
      id: "register",
      header: "Caja",
      render: (item: QuarantinedEvent) => item.registerName,
    }),
    dataColumn({
      id: "aggregate",
      header: "Registro",
      render: (item: QuarantinedEvent) => quarantinedRegisterText(item),
    }),
    dataColumn({
      id: "eventType",
      header: "Evento",
      render: (item: QuarantinedEvent) => quarantinedEventColumnText(item.eventType),
    }),
    dataColumn({
      id: "receivedAt",
      header: "Recibido",
      render: (item: QuarantinedEvent) => quarantinedDateTimeText(item.receivedAt),
    }),
    dataColumn({
      id: "quarantinedAt",
      header: "En cuarentena desde",
      render: (item: QuarantinedEvent) => quarantinedDateTimeText(item.quarantinedAt),
    }),
    dataColumn({
      id: "reason",
      header: "Último error",
      render: (item: QuarantinedEvent) => quarantinedReasonText(item.reason),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: QuarantinedEvent) => ({
          icon: <LockOpen />,
          "aria-label": `Liberar el ${quarantinedEventSentenceText(item.eventType)} de la caja ${item.registerName}`,
          onPress: () => openRelease(item),
        }),
      ],
    }),
  ] as const;
}

export function QuarantinedEventsScreen({
  onSessionEnded,
  services,
}: QuarantinedEventsScreenProps) {
  const { fetchQuarantinedEvents, releaseQuarantinedEventModal } = services;
  const data = useQuarantinedEventsQuery({ fetchQuarantinedEvents, onSessionEnded });
  const refresh = useRefreshSync();
  const [releaseTarget, setReleaseTarget] = useState<QuarantinedEvent | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);

  const events = data.status === "loaded" ? data.value.events : NO_EVENTS;
  const table = useTableModel({
    items: events,
    id: (event) => event.eventId,
    columns: columnsFor(setReleaseTarget),
  });

  function showNotice(shown: Omit<ScreenNotice, "id">) {
    lastNoticeId.current += 1;
    setNotice({ ...shown, id: lastNoticeId.current });
  }

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Configuración</p>
              <ScreenTitle>Eventos en cuarentena</ScreenTitle>
            </div>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <p className="max-w-3xl text-body text-text">
          Eventos que la nube recibió de las cajas y no pudo aplicar después de agotar los intentos.
          Cuando su causa esté resuelta, liberá uno: la nube vuelve a intentarlo y, si se aplica,
          sigue con los eventos del mismo registro que esperaban detrás.
        </p>
        <Table
          aria-label="Eventos en cuarentena"
          table={table}
          {...cloudTableState(data, "los eventos en cuarentena")}
          empty={{
            icon: <PackageX />,
            title: "No hay eventos en cuarentena",
            variant: "blank",
          }}
        />
      </ScreenLayout>
      <ReleaseQuarantinedEventModal
        target={releaseTarget}
        onClose={() => setReleaseTarget(null)}
        onReleased={() => {
          setReleaseTarget(null);
          showNotice({
            tone: "success",
            title: "Evento liberado",
            description: "La nube lo va a volver a intentar en los próximos minutos.",
          });
          void refresh();
        }}
        onOutdated={(reason) => {
          setReleaseTarget(null);
          showNotice({
            tone: "error",
            title: "No se liberó el evento",
            description:
              reason === "not_quarantined"
                ? "Este evento ya no está en cuarentena."
                : "No encontramos este evento.",
          });
          void refresh();
        }}
        onSessionEnded={onSessionEnded}
        {...(releaseQuarantinedEventModal ? { services: releaseQuarantinedEventModal } : {})}
      />
      {notice ? (
        <FloatingNotification
          key={notice.id}
          tone={notice.tone}
          icon={notice.tone === "success" ? <Check /> : <TriangleAlert />}
          title={notice.title}
          description={notice.description}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
    </>
  );
}
