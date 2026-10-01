import {
  Button,
  EmptyState,
  formatPointOfSaleNumber,
  LoadFailure,
  LoadingPlaceholder,
} from "@purosur/ui";
import { Laptop, Pencil } from "lucide-react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { CloudData } from "../platform/use-cloud-query";
import type { FiscalAddress } from "./fiscal-addresses-api";
import { DataPair } from "./fiscal-data-pair";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

type RegisterPointOfSaleSectionProps = {
  data: CloudData<[RegisterPointOfSale[], FiscalAddress[]]>;
  onEdit: (register: RegisterPointOfSale) => void;
};

const MISSING = "Sin configurar";

function RegisterPointOfSaleCard({
  register,
  fiscalAddresses,
  dataStatus,
  onEdit,
}: {
  register: RegisterPointOfSale;
  fiscalAddresses: FiscalAddress[];
  dataStatus: "loaded";
  onEdit: () => void;
}) {
  const fiscalAddress = fiscalAddresses.find(({ id }) => id === register.fiscalAddressId);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-text-accent text-subheading">{register.registerName}</h2>
        <Button
          variant="secondary"
          size="small"
          icon={<Pencil />}
          dataStatus={dataStatus}
          onPress={onEdit}
        >
          Editar
        </Button>
      </div>
      <div className="flex gap-8">
        <DataPair
          label="Punto de venta"
          value={
            register.pointOfSaleNumber === null
              ? null
              : formatPointOfSaleNumber(register.pointOfSaleNumber)
          }
          missing={MISSING}
        />
        <DataPair label="Domicilio fiscal" value={fiscalAddress?.name ?? null} missing={MISSING} />
      </div>
    </div>
  );
}

export function RegisterPointOfSaleSection({ data, onEdit }: RegisterPointOfSaleSectionProps) {
  if (data.status === "loading") {
    return <LoadingPlaceholder variant="card" lines={2} />;
  }
  if (data.status === "failed") {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <LoadFailure {...cloudLoadFailure(data, "los puntos de venta")} />
      </div>
    );
  }
  const [registers, fiscalAddresses] = data.value;
  if (registers.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <EmptyState
          icon={<Laptop />}
          title="Todavía no hay cajas registradoras"
          description="Creá una para configurar su punto de venta."
          variant="blank"
        />
      </div>
    );
  }
  return (
    <>
      {registers.map((register) => (
        <RegisterPointOfSaleCard
          key={register.registerId}
          register={register}
          fiscalAddresses={fiscalAddresses}
          dataStatus={data.status}
          onEdit={() => onEdit(register)}
        />
      ))}
    </>
  );
}
