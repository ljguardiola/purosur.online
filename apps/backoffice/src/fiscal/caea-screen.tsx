import {
  Button,
  FloatingNotification,
  formatCalendarDayRange,
  formatInvoiceNumber,
  formatPointOfSaleNumber,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Check, QrCode } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { combineCloudData } from "../platform/combine-cloud-data";
import {
  type BackofficeAccess,
  canSeeContingencyTicketRescue,
  canSeeFiscalConfigurationArea,
  canSeeFiscalInformation,
} from "../shell/backoffice-access";
import { CaeaSection } from "./caea-section";
import type { CaeaScreenServices } from "./caea-services";
import { ConfirmRevokedInstallationModal } from "./confirm-revoked-installation-modal";
import type { ExceptionalityFilters } from "./exceptionality-filters";
import { ExceptionalitySection } from "./exceptionality-section";
import {
  useExceptionShareYearQuery,
  useFiscalAddressesQuery,
  useFortnightPresentationsQuery,
  useOfflinePointsOfSaleQuery,
  useRegisterPointsOfSaleQuery,
  useReloadFortnightPresentations,
  useReloadOfflinePointsOfSale,
} from "./fiscal-queries";
import { POINTS_OF_SALE_ANCHOR } from "./fiscal-tabs";
import { FortnightReportsSection } from "./fortnight-reports-section";
import type { OfflinePointOfSale } from "./offline-points-of-sale-api";
import { OfflinePointsOfSaleSection } from "./offline-points-of-sale-section";
import { RegisterPointOfSaleSection } from "./register-point-of-sale-section";
import type { RemedyTarget } from "./rejected-document-remedy-form";
import { RetireOfflinePointOfSaleModal } from "./retire-offline-point-of-sale-modal";
import { ReviewRejectedDocumentModal } from "./review-rejected-document-modal";
import { revokedInstallationDayAndTime } from "./revoked-installation-moments";
import type { RevokedInstallationTarget } from "./revoked-installation-target";

export type CaeaScreenProps = {
  access: BackofficeAccess;
  filters: ExceptionalityFilters;
  onFiltersChange: (filters: ExceptionalityFilters) => void;
  onRescue: () => void;
  onSessionEnded: () => void;
  services: CaeaScreenServices;
};

type ScreenNotice = { id: number; title: string; description: string };

export function CaeaScreen({
  access,
  filters,
  onFiltersChange,
  onRescue,
  onSessionEnded,
  services,
}: CaeaScreenProps) {
  const canSeeInformation = canSeeFiscalInformation(access);
  const canSeeConfiguration = canSeeFiscalConfigurationArea(access);
  const presentations = useFortnightPresentationsQuery({
    enabled: canSeeConfiguration,
    fetchFortnightPresentations: services.fetchFortnightPresentations,
    onSessionEnded,
  });
  const registers = useRegisterPointsOfSaleQuery({
    enabled: canSeeConfiguration,
    fetchRegisterPointsOfSale: services.fetchRegisterPointsOfSale,
    onSessionEnded,
  });
  const fiscalAddresses = useFiscalAddressesQuery({
    enabled: canSeeInformation || canSeeConfiguration,
    fetchFiscalAddresses: services.fetchFiscalAddresses,
    onSessionEnded,
  });
  const listedAddresses = fiscalAddresses.status === "loaded" ? fiscalAddresses.value : [];
  const fiscalAddressFilter =
    fiscalAddresses.status === "loaded" &&
    !listedAddresses.some(({ id }) => id === filters.fiscalAddress)
      ? ""
      : filters.fiscalAddress;
  const fiscalAddressId = fiscalAddressFilter === "" ? listedAddresses[0]?.id : fiscalAddressFilter;
  const exceptionShare = useExceptionShareYearQuery({
    fiscalAddressId:
      canSeeInformation && fiscalAddresses.status === "loaded" ? fiscalAddressId : undefined,
    year: filters.year,
    fetchExceptionShareYear: services.fetchExceptionShareYear,
    onSessionEnded,
  });
  const shownYear =
    exceptionShare.status === "loaded" && exceptionShare.value.kind === "found"
      ? exceptionShare.value.year
      : undefined;
  const yearFilter =
    shownYear !== undefined &&
    filters.year !== undefined &&
    !shownYear.selectable_years.includes(filters.year)
      ? undefined
      : filters.year;
  const reportFilters = useEffectEvent(onFiltersChange);
  useEffect(() => {
    if (!canSeeInformation) {
      return;
    }
    const shownFilters: ExceptionalityFilters = {
      fiscalAddress: fiscalAddressFilter,
      ...(yearFilter === undefined ? {} : { year: yearFilter }),
    };
    if (!deepEqual(shownFilters, filters)) {
      reportFilters(shownFilters);
    }
  }, [canSeeInformation, fiscalAddressFilter, yearFilter, filters]);
  const offlinePointsOfSale = useOfflinePointsOfSaleQuery({
    enabled: canSeeConfiguration,
    fetchOfflinePointsOfSale: services.fetchOfflinePointsOfSale,
    onSessionEnded,
  });
  const reloadFortnightPresentations = useReloadFortnightPresentations();
  const reloadOfflinePointsOfSale = useReloadOfflinePointsOfSale();
  const [reviewing, setReviewing] = useState<RemedyTarget | null>(null);
  const [confirmingRevoked, setConfirmingRevoked] = useState<RevokedInstallationTarget | null>(
    null,
  );
  const [retiring, setRetiring] = useState<OfflinePointOfSale | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);

  function announce(title: string, description: string) {
    lastNoticeId.current += 1;
    setNotice({ id: lastNoticeId.current, title, description });
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 p-6">
      {canSeeContingencyTicketRescue(access) ? (
        <div>
          <Button variant="secondary" icon={<QrCode />} onPress={onRescue}>
            Rescatar tickets de contingencia
          </Button>
        </div>
      ) : null}
      {canSeeInformation ? (
        <CaeaSection anchor="exceptionality" title="Excepcionalidad">
          <ExceptionalitySection
            addresses={fiscalAddresses}
            read={exceptionShare}
            fiscalAddressId={fiscalAddressId}
            onFiscalAddressChange={(fiscalAddress) =>
              onFiltersChange({ ...filters, fiscalAddress })
            }
            onYearChange={(year) => onFiltersChange({ ...filters, year })}
          />
        </CaeaSection>
      ) : null}
      {canSeeConfiguration ? (
        <>
          <CaeaSection anchor="fortnight-reports" title="Informes quincenales">
            <FortnightReportsSection
              data={combineCloudData(presentations, registers)}
              onReview={setReviewing}
              onConfirmRevoked={setConfirmingRevoked}
            />
          </CaeaSection>
          <CaeaSection anchor={POINTS_OF_SALE_ANCHOR} title="Puntos de venta">
            <RegisterPointOfSaleSection data={combineCloudData(registers, fiscalAddresses)} />
            <OfflinePointsOfSaleSection data={offlinePointsOfSale} onRetire={setRetiring} />
          </CaeaSection>
        </>
      ) : null}
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
    </div>
  );
}
