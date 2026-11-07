import {
  Button,
  FloatingNotification,
  formatCalendarDayRange,
  formatInvoiceNumber,
  formatPointOfSaleNumber,
} from "@purosur/ui";
import { Check, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { combineCloudData } from "../platform/combine-cloud-data";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { ConfirmRevokedInstallationModal } from "./confirm-revoked-installation-modal";
import { EditFiscalAddressModal } from "./edit-fiscal-address-modal";
import { FiscalAddressesSection } from "./fiscal-addresses-section";
import {
  useFiscalAddressesQuery,
  useFortnightPresentationsQuery,
  useOfflinePointsOfSaleQuery,
  useRegisterPointsOfSaleQuery,
  useReloadFiscalAddresses,
  useReloadFortnightPresentations,
  useReloadOfflinePointsOfSale,
} from "./fiscal-queries";
import { FortnightReportsSection } from "./fortnight-reports-section";
import { NewFiscalAddressModal } from "./new-fiscal-address-modal";
import type { OfflinePointOfSale } from "./offline-points-of-sale-api";
import { OfflinePointsOfSaleSection } from "./offline-points-of-sale-section";
import type { PointsOfSaleScreenServices } from "./points-of-sale-services";
import { RegisterPointOfSaleSection } from "./register-point-of-sale-section";
import type { RemedyTarget } from "./rejected-document-remedy-form";
import { RetireOfflinePointOfSaleModal } from "./retire-offline-point-of-sale-modal";
import { ReviewRejectedDocumentModal } from "./review-rejected-document-modal";
import { revokedInstallationDayAndTime } from "./revoked-installation-moments";
import type { RevokedInstallationTarget } from "./revoked-installation-target";

export type PointsOfSaleScreenProps = {
  onSessionEnded: () => void;
  services: PointsOfSaleScreenServices;
};

type ScreenNotice = { id: number; title: string; description: string };

export function PointsOfSaleScreen({ onSessionEnded, services }: PointsOfSaleScreenProps) {
  const { fetchRegisterPointsOfSale, fetchFiscalAddresses, fetchFortnightPresentations } = services;
  const registers = useRegisterPointsOfSaleQuery({ fetchRegisterPointsOfSale, onSessionEnded });
  const fiscalAddresses = useFiscalAddressesQuery({ fetchFiscalAddresses, onSessionEnded });
  const presentations = useFortnightPresentationsQuery({
    fetchFortnightPresentations,
    onSessionEnded,
  });
  const offlinePointsOfSale = useOfflinePointsOfSaleQuery({
    fetchOfflinePointsOfSale: services.fetchOfflinePointsOfSale,
    onSessionEnded,
  });
  const reloadOfflinePointsOfSale = useReloadOfflinePointsOfSale();
  const reloadFortnightPresentations = useReloadFortnightPresentations();
  const [reviewing, setReviewing] = useState<RemedyTarget | null>(null);
  const [confirmingRevoked, setConfirmingRevoked] = useState<RevokedInstallationTarget | null>(
    null,
  );
  const [retiring, setRetiring] = useState<OfflinePointOfSale | null>(null);
  const reloadFiscalAddresses = useReloadFiscalAddresses({ fetchFiscalAddresses });
  const [editingFiscalAddressId, setEditingFiscalAddressId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);

  function announce(title: string, description: string) {
    lastNoticeId.current += 1;
    setNotice({ id: lastNoticeId.current, title, description });
  }

  const registersWithAddresses = combineCloudData(registers, fiscalAddresses);
  const loadedFiscalAddresses = fiscalAddresses.status === "loaded" ? fiscalAddresses.value : [];
  const editingFiscalAddress =
    loadedFiscalAddresses.find(({ id }) => id === editingFiscalAddressId) ?? null;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Caja y fiscal · Fiscal</p>
              <ScreenTitle>Puntos de venta</ScreenTitle>
            </div>
            <Button variant="primary" icon={<Plus />} onPress={() => setCreating(true)}>
              Nuevo domicilio fiscal
            </Button>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <RegisterPointOfSaleSection data={registersWithAddresses} />
        <OfflinePointsOfSaleSection data={offlinePointsOfSale} onRetire={setRetiring} />
        <FortnightReportsSection
          data={combineCloudData(presentations, registers)}
          onReview={setReviewing}
          onConfirmRevoked={setConfirmingRevoked}
        />
        <FiscalAddressesSection
          data={fiscalAddresses}
          onEdit={({ id }) => setEditingFiscalAddressId(id)}
        />
      </ScreenLayout>
      <NewFiscalAddressModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={({ name }) => {
          setCreating(false);
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
      <RetireOfflinePointOfSaleModal
        target={retiring}
        onClose={() => setRetiring(null)}
        onRetired={(retired) => {
          void reloadOfflinePointsOfSale();
          announce(
            "Punto de venta dado de baja",
            `${formatPointOfSaleNumber(retired.pointOfSaleNumber)}.`,
          );
        }}
        onOutdated={() => void reloadOfflinePointsOfSale()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <ReviewRejectedDocumentModal
        target={reviewing}
        onClose={() => setReviewing(null)}
        onRemedied={({ pointOfSaleNumber, rejectedDocument }) => {
          void reloadFortnightPresentations();
          announce(
            "Informe corregido",
            `Nº ${formatInvoiceNumber(rejectedDocument.number)} del punto de venta ${formatPointOfSaleNumber(pointOfSaleNumber)}: se vuelve a presentar con el mismo número.`,
          );
        }}
        onOutdated={() => void reloadFortnightPresentations()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <ConfirmRevokedInstallationModal
        target={confirmingRevoked}
        onClose={() => setConfirmingRevoked(null)}
        onConfirmed={({ registerName, revokedAt, pointOfSaleNumber, fortnight }) => {
          void reloadFortnightPresentations();
          announce(
            "Instalación confirmada",
            `${registerName}, revocada el ${revokedInstallationDayAndTime(revokedAt)}, para el informe ${formatCalendarDayRange(fortnight.start, fortnight.end)} del punto de venta ${formatPointOfSaleNumber(pointOfSaleNumber)}.`,
          );
        }}
        onOutdated={() => void reloadFortnightPresentations()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
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
