import { FloatingNotification } from "@purosur/ui";
import { Check } from "lucide-react";
import { useRef, useState } from "react";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { BuyerIdentificationThresholdSection } from "./buyer-identification-threshold-section";
import { formatDisplayDate } from "./display-date";
import { EditIssuerIdentificationModal } from "./edit-issuer-identification-modal";
import type { FiscalConfigurationScreenServices } from "./fiscal-configuration-services";
import {
  useBuyerIdentificationThresholdsQuery,
  useIssuerIdentificationQuery,
  useReloadBuyerIdentificationThresholds,
  useReloadIssuerIdentification,
} from "./fiscal-queries";
import { IssuerIdentificationSection } from "./issuer-identification-section";
import { RecordBuyerIdentificationThresholdModal } from "./record-buyer-identification-threshold-modal";

export type FiscalConfigurationScreenProps = {
  onSessionEnded: () => void;
  services: FiscalConfigurationScreenServices;
  now?: () => Date;
};

type ScreenNotice = { id: number; title: string; description: string };

export function FiscalConfigurationScreen({
  onSessionEnded,
  services,
  now,
}: FiscalConfigurationScreenProps) {
  const { fetchIssuerIdentification, fetchBuyerIdentificationThresholds } = services;
  const clock = now ?? (() => new Date());
  const data = useIssuerIdentificationQuery({ fetchIssuerIdentification, onSessionEnded });
  const reload = useReloadIssuerIdentification({ fetchIssuerIdentification });
  const thresholds = useBuyerIdentificationThresholdsQuery({
    fetchBuyerIdentificationThresholds,
    onSessionEnded,
  });
  const reloadThresholds = useReloadBuyerIdentificationThresholds({
    fetchBuyerIdentificationThresholds,
  });
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);
  if (editing && data.status === "failed") {
    setEditing(false);
  }

  const issuerIdentification = data.status === "loaded" ? data.value : null;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Caja y fiscal · Fiscal</p>
              <ScreenTitle>Configuración fiscal</ScreenTitle>
            </div>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <IssuerIdentificationSection data={data} onEdit={() => setEditing(true)} />
        <BuyerIdentificationThresholdSection
          data={thresholds}
          onRecord={() => setRecording(true)}
        />
        <EditIssuerIdentificationModal
          target={editing ? issuerIdentification : null}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
          reload={reload}
          onSessionEnded={onSessionEnded}
          services={services}
          now={clock}
        />
        <RecordBuyerIdentificationThresholdModal
          open={recording}
          onClose={() => setRecording(false)}
          onRecorded={(recorded) => {
            setRecording(false);
            lastNoticeId.current += 1;
            setNotice({
              id: lastNoticeId.current,
              title: "Umbral cargado",
              description: `Rige desde el ${formatDisplayDate(recorded.validFrom)}.`,
            });
          }}
          reload={reloadThresholds}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      </ScreenLayout>
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
    </>
  );
}
