import { actionsColumn, dataColumn, FloatingNotification, Table, useTableModel } from "@purosur/ui";
import { Check, LockOpen, PackageX, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { AreaTab } from "../shell/area-tabs";
import { SettingsFrame } from "../shell/settings-frame";
import type { SettingsTab } from "../shell/settings-tabs";
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
  settingsTabs: readonly AreaTab<SettingsTab>[];
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
      header: "Retenido desde",
      render: (item: QuarantinedEvent) => quarantinedDateTimeText(item.quarantinedAt),
    }),
    dataColumn({
      id: "reason",
      header: "Motivo",
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
  settingsTabs,
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
      <SettingsFrame tabs={settingsTabs} selected="held-register-changes">
        <p className="max-w-3xl text-body text-text">
          Eventos que la nube recibió de las cajas y no pudo aplicar después de agotar los intentos.
          Cuando su causa esté resuelta, liberá uno: la nube vuelve a intentarlo y, si se aplica,
          sigue con los eventos del mismo registro que esperaban detrás.
        </p>
        <Table
          aria-label="Cambios de cajas retenidos"
          table={table}
          {...cloudTableState(data, "los cambios de cajas retenidos")}
          empty={{
            icon: <PackageX />,
            title: "No hay cambios de cajas retenidos",
            variant: "blank",
          }}
        />
      </SettingsFrame>
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
                ? "Este cambio ya no está retenido."
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
