import { Button, InlineNotice, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { CircleAlert, Pencil } from "lucide-react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { formatDisplayDate } from "../platform/display-date";
import type { CloudData } from "../platform/use-cloud-query";
import { DataPair, FixedPair } from "./fiscal-data-pair";
import type { IssuerIdentification } from "./issuer-identification-api";

type IssuerIdentificationSectionProps = {
  data: CloudData<IssuerIdentification>;
  onEdit: () => void;
};

export function IssuerIdentificationSection({ data, onEdit }: IssuerIdentificationSectionProps) {
  const issuerIdentification = data.status === "loaded" ? data.value : null;
  const incomplete =
    issuerIdentification !== null &&
    (issuerIdentification.legalName === null ||
      issuerIdentification.grossIncomeRegistration === null ||
      issuerIdentification.activityStartDate === null);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-text-accent text-subheading">Identificación del emisor</h2>
        <Button
          variant="secondary"
          size="small"
          icon={<Pencil />}
          dataStatus={data.status}
          onPress={onEdit}
        >
          Editar
        </Button>
      </div>
      {data.status === "loading" && <LoadingPlaceholder variant="form" fields={2} />}
      {data.status === "failed" && (
        <LoadFailure {...cloudLoadFailure(data, "la configuración fiscal")} />
      )}
      {issuerIdentification !== null && (
        <>
          {incomplete ? (
            <InlineNotice
              tone="error"
              icon={<CircleAlert />}
              title="Las cajas no están emitiendo facturas ni notas de crédito"
              description="Hasta que se carguen los datos que faltan. Las ventas se siguen cobrando."
            />
          ) : null}
          <div className="flex gap-8">
            <DataPair label="Razón social" value={issuerIdentification.legalName} />
            <FixedPair label="CUIT" value={issuerIdentification.authorizedCuit} />
            <FixedPair label="Condición frente al IVA" value={issuerIdentification.taxStatus} />
            <DataPair
              label="Ingresos Brutos"
              value={issuerIdentification.grossIncomeRegistration}
            />
            <DataPair
              label="Inicio de actividades"
              value={
                issuerIdentification.activityStartDate
                  ? formatDisplayDate(issuerIdentification.activityStartDate)
                  : null
              }
            />
          </div>
          <p className="text-text-subtle text-detail">Lo imprime cada factura y nota de crédito.</p>
        </>
      )}
    </div>
  );
}
