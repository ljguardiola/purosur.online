import { FloatingNotification } from "@purosur/ui";
import { Check } from "lucide-react";
import { useRef, useState } from "react";
import { formatDisplayDate } from "../platform/display-date";
import { BuyerIdentificationThresholdSection } from "./buyer-identification-threshold-section";
import { ClockCorrectionsSection } from "./clock-corrections-section";
import { EditFiscalAddressModal } from "./edit-fiscal-address-modal";
import { EditIssuerIdentificationModal } from "./edit-issuer-identification-modal";
import { FiscalAddressesSection } from "./fiscal-addresses-section";
import {
  useBuyerIdentificationThresholdsQuery,
  useClockCorrectionsQuery,
  useFiscalAddressesQuery,
  useIssuerIdentificationQuery,
  useReloadBuyerIdentificationThresholds,
  useReloadFiscalAddresses,
  useReloadIssuerIdentification,
} from "./fiscal-queries";
import type { FiscalSettingsScreenServices } from "./fiscal-settings-services";
import { IssuerIdentificationSection } from "./issuer-identification-section";
import { NewFiscalAddressModal } from "./new-fiscal-address-modal";
import { RecordBuyerIdentificationThresholdModal } from "./record-buyer-identification-threshold-modal";

export type FiscalSettingsScreenProps = {
  onSessionEnded: () => void;
  services: FiscalSettingsScreenServices;
  now?: () => Date;
};

type ScreenNotice = { id: number; title: string; description: string };

export function FiscalSettingsScreen({ onSessionEnded, services, now }: FiscalSettingsScreenProps) {
  const {
    fetchIssuerIdentification,
    fetchBuyerIdentificationThresholds,
    fetchClockCorrections,
    fetchFiscalAddresses,
  } = services;
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
  const clockCorrections = useClockCorrectionsQuery({ fetchClockCorrections, onSessionEnded });
  const fiscalAddresses = useFiscalAddressesQuery({ fetchFiscalAddresses, onSessionEnded });
  const reloadFiscalAddresses = useReloadFiscalAddresses({ fetchFiscalAddresses });
  const [editingFiscalAddressId, setEditingFiscalAddressId] = useState<string | null>(null);
  const [creatingFiscalAddress, setCreatingFiscalAddress] = useState(false);
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);
  if (editing && data.status === "failed") {
    setEditing(false);
  }

  const issuerIdentification = data.status === "loaded" ? data.value : null;
  const loadedFiscalAddresses = fiscalAddresses.status === "loaded" ? fiscalAddresses.value : [];
  const editingFiscalAddress =
    loadedFiscalAddresses.find(({ id }) => id === editingFiscalAddressId) ?? null;

  function announce(title: string, description: string) {
    lastNoticeId.current += 1;
    setNotice({ id: lastNoticeId.current, title, description });
  }

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
        <IssuerIdentificationSection data={data} onEdit={() => setEditing(true)} />
        <BuyerIdentificationThresholdSection
          data={thresholds}
          onRecord={() => setRecording(true)}
        />
        <FiscalAddressesSection
          data={fiscalAddresses}
          onCreate={() => setCreatingFiscalAddress(true)}
          onEdit={({ id }) => setEditingFiscalAddressId(id)}
        />
        <ClockCorrectionsSection data={clockCorrections} />
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
            announce("Umbral cargado", `Rige desde el ${formatDisplayDate(recorded.validFrom)}.`);
          }}
          reload={reloadThresholds}
          onSessionEnded={onSessionEnded}
          services={services}
        />
        <NewFiscalAddressModal
          open={creatingFiscalAddress}
          onClose={() => setCreatingFiscalAddress(false)}
          onCreated={({ name }) => {
            setCreatingFiscalAddress(false);
            void reloadFiscalAddresses();
            announce("Domicilio fiscal creado", `${name}.`);
          }}
          onSessionEnded={onSessionEnded}
          services={services}
        />
        <EditFiscalAddressModal
          target={editingFiscalAddress}
          onClose={() => setEditingFiscalAddressId(null)}
          onSaved={(name) => {
            setEditingFiscalAddressId(null);
            announce("Domicilio fiscal guardado", `${name}.`);
          }}
          reload={reloadFiscalAddresses}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      </div>
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
