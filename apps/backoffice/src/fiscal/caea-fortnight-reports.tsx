import { formatCalendarDayRange, formatInvoiceNumber, formatPointOfSaleNumber } from "@purosur/ui";
import { useState } from "react";
import { combineCloudData } from "../platform/combine-cloud-data";
import type { CaeaFortnightReportsServices } from "./caea-services";
import { ConfirmRevokedInstallationModal } from "./confirm-revoked-installation-modal";
import {
  useFortnightPresentationsQuery,
  useRegisterPointsOfSaleQuery,
  useReloadFortnightPresentations,
} from "./fiscal-queries";
import { FortnightReportsSection } from "./fortnight-reports-section";
import type { RemedyTarget } from "./rejected-document-remedy-form";
import { ReviewRejectedDocumentModal } from "./review-rejected-document-modal";
import { revokedInstallationDayAndTime } from "./revoked-installation-moments";
import type { RevokedInstallationTarget } from "./revoked-installation-target";

export function CaeaFortnightReports({
  onAnnounce,
  onSessionEnded,
  services,
}: {
  onAnnounce: (title: string, description: string) => void;
  onSessionEnded: () => void;
  services: CaeaFortnightReportsServices;
}) {
  const presentations = useFortnightPresentationsQuery({
    fetchFortnightPresentations: services.fetchFortnightPresentations,
    onSessionEnded,
  });
  const registers = useRegisterPointsOfSaleQuery({
    fetchRegisterPointsOfSale: services.fetchRegisterPointsOfSale,
    onSessionEnded,
  });
  const reloadFortnightPresentations = useReloadFortnightPresentations();
  const [reviewing, setReviewing] = useState<RemedyTarget | null>(null);
  const [confirmingRevoked, setConfirmingRevoked] = useState<RevokedInstallationTarget | null>(
    null,
  );

  return (
    <>
      <FortnightReportsSection
        data={combineCloudData(presentations, registers)}
        onReview={setReviewing}
        onConfirmRevoked={setConfirmingRevoked}
      />
      <ReviewRejectedDocumentModal
        target={reviewing}
        onClose={() => setReviewing(null)}
        onRemedied={({ pointOfSaleNumber, rejectedDocument }) => {
          void reloadFortnightPresentations();
          onAnnounce(
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
          onAnnounce(
            "Instalación confirmada",
            `${registerName}, revocada el ${revokedInstallationDayAndTime(revokedAt)}, para el informe ${formatCalendarDayRange(fortnight.start, fortnight.end)} del punto de venta ${formatPointOfSaleNumber(pointOfSaleNumber)}.`,
          );
        }}
        onOutdated={() => void reloadFortnightPresentations()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </>
  );
}
