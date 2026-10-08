import { registerSyncStatusSchema } from "@purosur/contracts";
import { dataColumn, formatDate, Table, useTableModel } from "@purosur/ui";
import { Laptop } from "lucide-react";
import { useId } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { schemaText } from "../platform/schema-text";
import { useRegisterSyncStatusQuery } from "./register-queries";
import type { fetchRegisterSyncStatus, RegisterSyncStatus } from "./registers-api";

export type RegistersSyncSectionServices = {
  fetchRegisterSyncStatus: typeof fetchRegisterSyncStatus;
};

export type RegistersSyncSectionProps = {
  onSessionEnded: () => void;
  services: RegistersSyncSectionServices;
};

const NO_REGISTERS: RegisterSyncStatus[] = [];

const SYNC_TIME_ZONE = schemaText(
  registerSyncStatusSchema.shape.last_successful_sync_at.meta()?.["timeZone"],
);

function syncDateTime(instant: string): string {
  const date = new Date(instant);
  const day = formatDate(date, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: SYNC_TIME_ZONE,
  });
  const time = formatDate(date, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SYNC_TIME_ZONE,
  });
  return `${day} ${time}`;
}

const columns = [
  dataColumn({
    id: "register",
    header: "Caja",
    render: (item: RegisterSyncStatus) => (
      <span className="text-text text-detail">{item.name}</span>
    ),
  }),
  dataColumn({
    id: "lastSync",
    header: "Última sincronización",
    render: (item: RegisterSyncStatus) =>
      item.lastSuccessfulSyncAt === null ? (
        <span className="text-text-subtle text-detail">Nunca sincronizó</span>
      ) : (
        <span className="text-text text-detail">{syncDateTime(item.lastSuccessfulSyncAt)}</span>
      ),
  }),
] as const;

export function RegistersSyncSection({ onSessionEnded, services }: RegistersSyncSectionProps) {
  const headingId = useId();
  const data = useRegisterSyncStatusQuery({
    fetchRegisterSyncStatus: services.fetchRegisterSyncStatus,
    onSessionEnded,
  });
  const table = useTableModel({
    items: data.status === "loaded" ? data.value : NO_REGISTERS,
    id: (register) => register.id,
    columns,
  });
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-subheading text-text">
        Cajas
      </h2>
      <Table
        aria-label="Última sincronización de las cajas"
        table={table}
        {...cloudTableState(data, "las cajas")}
        empty={{
          icon: <Laptop />,
          title: "Todavía no hay cajas registradoras",
          description: "Cuando se cree la primera, aparece acá.",
          variant: "blank",
        }}
      />
    </section>
  );
}
