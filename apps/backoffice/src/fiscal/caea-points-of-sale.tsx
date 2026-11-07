import { formatPointOfSaleNumber } from "@purosur/ui";
import { useState } from "react";
import { combineCloudData } from "../platform/combine-cloud-data";
import type { CaeaPointsOfSaleServices } from "./caea-services";
import {
  useFiscalAddressesQuery,
  useOfflinePointsOfSaleQuery,
  useRegisterPointsOfSaleQuery,
  useReloadOfflinePointsOfSale,
} from "./fiscal-queries";
import type { OfflinePointOfSale } from "./offline-points-of-sale-api";
import { OfflinePointsOfSaleSection } from "./offline-points-of-sale-section";
import { RegisterPointOfSaleSection } from "./register-point-of-sale-section";
import { RetireOfflinePointOfSaleModal } from "./retire-offline-point-of-sale-modal";

export function CaeaPointsOfSale({
  onAnnounce,
  onSessionEnded,
  services,
}: {
  onAnnounce: (title: string, description: string) => void;
  onSessionEnded: () => void;
  services: CaeaPointsOfSaleServices;
}) {
  const registers = useRegisterPointsOfSaleQuery({
    fetchRegisterPointsOfSale: services.fetchRegisterPointsOfSale,
    onSessionEnded,
  });
  const fiscalAddresses = useFiscalAddressesQuery({
    fetchFiscalAddresses: services.fetchFiscalAddresses,
    onSessionEnded,
  });
  const offlinePointsOfSale = useOfflinePointsOfSaleQuery({
    fetchOfflinePointsOfSale: services.fetchOfflinePointsOfSale,
    onSessionEnded,
  });
  const reloadOfflinePointsOfSale = useReloadOfflinePointsOfSale();
  const [retiring, setRetiring] = useState<OfflinePointOfSale | null>(null);

  return (
    <>
      <RegisterPointOfSaleSection data={combineCloudData(registers, fiscalAddresses)} />
      <OfflinePointsOfSaleSection data={offlinePointsOfSale} onRetire={setRetiring} />
      <RetireOfflinePointOfSaleModal
        target={retiring}
        onClose={() => setRetiring(null)}
        onRetired={(retired) => {
          void reloadOfflinePointsOfSale();
          onAnnounce(
            "Punto de venta dado de baja",
            `${formatPointOfSaleNumber(retired.pointOfSaleNumber)}.`,
          );
        }}
        onOutdated={() => void reloadOfflinePointsOfSale()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </>
  );
}
